import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assignCloudId,
  cloudIdMapStorageKeys,
  createEmptyCloudIdMap,
  createNonDemoReviewProof,
  findDuplicateLogGroups,
  inspectDemoMarker,
  isCurrentNonDemoReviewProof,
  isJsonCompatible,
  mapHabitLogToCloudRow,
  mapHabitToCloudRow,
  mergeCloudIdMaps,
  normalizeCloudIdMap,
  validateLocalSyncRecords,
} from './cloudSync.ts'
import {
  bindSyncOwner,
  confirmNonDemoDataset,
  loadCloudIdMap,
  loadDemoProvenanceMetadata,
  loadSyncOwnerLock,
  prepareInitialSyncPayload,
  recordDemoProvenance,
  saveCloudIdMap,
  validateImported,
} from './db.ts'

const ownerId = '8c1d4f2a-03ea-4e75-a01a-4dc6a3ebc390'
const otherOwnerId = '65a905ab-9531-4f60-9481-56a430af1c85'
const habitCloudId = '11111111-1111-4111-8111-111111111111'
const logCloudId = '22222222-2222-4222-8222-222222222222'

function sampleHabit(overrides = {}) {
  return {
    id: 'legacy-habit-17', name: 'Read', category: 'Mind', icon: '📚', color: '#a78bfa',
    description: 'Read a book', target: 20, unit: 'pages', trackingType: 'count',
    scheduleType: 'weekdays', weekdays: [1, 2, 3, 4, 5], reminderTime: '08:30', paused: false,
    order: 2, createdAt: '2025-01-02T03:04:05.000Z', ...overrides,
  }
}

function sampleLog(overrides = {}) {
  return {
    id: 'legacy-log-41', habitId: 'legacy-habit-17', date: '2025-01-03', status: 'completed',
    value: 23, note: 'Finished the chapter', updatedAt: '2025-01-03T09:10:11.000Z', ...overrides,
  }
}

function sampleState(overrides = {}) {
  return {
    version: 1, habits: [sampleHabit()], logs: [sampleLog()], demo: false,
    sessions: [{ id: 'local-session', note: 'local timer session' }], goals: [], notes: [{ body: 'private journal entry' }],
    categories: ['Mind'], settings: { aiApiKey: 'local-secret' }, timer: { status: 'running' },
    gamification: {}, profile: {}, moods: [], ...overrides,
  }
}

class FakeLocalStorage {
  constructor() { this.values = new Map(); this.failRead = false; this.failWrite = false }
  getItem(key) {
    if (this.failRead) throw new Error('simulated localStorage read failure')
    return this.values.has(key) ? this.values.get(key) : null
  }
  setItem(key, value) {
    if (this.failWrite) throw new Error('simulated localStorage write failure')
    this.values.set(key, String(value))
  }
  removeItem(key) { this.values.delete(key) }
}

class FakeTransaction {
  constructor(database, mode) {
    this.database = database
    this.mode = mode
    this.pending = 0
    this.writes = new Map()
    this.deletes = new Set()
    this.aborted = false
    this.completionScheduled = false
    this.abortScheduled = false
    this.error = null
  }
  objectStore() {
    return {
      get: key => {
        const request = { result: undefined, error: null, onsuccess: null, onerror: null }
        this.pending++
        queueMicrotask(() => {
          if (this.aborted) return
          try {
            const stored = this.writes.has(key) ? this.writes.get(key) : this.database.values.get(key)
            request.result = stored === undefined ? undefined : structuredClone(stored)
            request.onsuccess?.()
          } catch (error) {
            request.error = error
            request.onerror?.()
          } finally {
            this.pending--
            this.completeWhenReady()
          }
        })
        return request
      },
      put: (value, key) => {
        if (this.mode !== 'readwrite') throw new Error('Read-only transaction cannot write.')
        this.writes.set(key, structuredClone(value))
        this.deletes.delete(key)
      },
      delete: key => {
        if (this.mode !== 'readwrite') throw new Error('Read-only transaction cannot delete.')
        this.deletes.add(key)
        this.writes.delete(key)
      },
    }
  }
  abort() {
    this.aborted = true
    if (this.abortScheduled) return
    this.abortScheduled = true
    queueMicrotask(() => this.onabort?.())
  }
  completeWhenReady() {
    if (this.pending || this.aborted || this.completionScheduled) return
    this.completionScheduled = true
    queueMicrotask(() => {
      if (this.aborted) return
      for (const key of this.deletes) this.database.values.delete(key)
      for (const [key, value] of this.writes) this.database.values.set(key, value)
      this.oncomplete?.()
    })
  }
}

class FakeDatabase {
  constructor() { this.values = new Map() }
  createObjectStore() { return {} }
  transaction(_store, mode) { return new FakeTransaction(this, mode) }
  close() {}
}

function installFakeBrowserStorage() {
  const descriptors = Object.fromEntries(['indexedDB', 'localStorage', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const database = new FakeDatabase()
  const localStorage = new FakeLocalStorage()
  let initialized = false
  const locks = new Map()
  const navigator = {
    locks: {
      request(name, _options, callback) {
        const previous = locks.get(name) ?? Promise.resolve()
        const run = previous.then(callback)
        locks.set(name, run.catch(() => undefined))
        return run
      },
    },
  }
  const indexedDB = {
    open() {
      const request = { result: undefined, error: null, onupgradeneeded: null, onsuccess: null, onerror: null }
      queueMicrotask(() => {
        request.result = database
        if (!initialized) {
          initialized = true
          request.onupgradeneeded?.()
        }
        request.onsuccess?.()
      })
      return request
    },
  }
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, writable: true, value: indexedDB })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: localStorage })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: navigator })
  return {
    database,
    localStorage,
    restore() {
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete globalThis[key]
      }
    },
  }
}

test('habit payload rows use only approved columns and allowlisted details', () => {
  const habit = sampleHabit({ aiApiKey: 'must not escape', journalNote: 'local only' })
  const row = mapHabitToCloudRow(habit, ownerId, habitCloudId, '2025-01-04T00:00:00.000Z', { secret: 'not approved' })
  assert.deepEqual(Object.keys(row).sort(), ['category', 'details', 'id', 'name', 'updated_at', 'user_id'])
  assert.deepEqual(row.details, {
    icon: habit.icon, color: habit.color, description: habit.description, target: habit.target,
    unit: habit.unit, trackingType: habit.trackingType, scheduleType: habit.scheduleType,
    weekdays: habit.weekdays, reminderTime: habit.reminderTime, paused: habit.paused,
    order: habit.order, createdAt: habit.createdAt, _habitOs: { schemaVersion: 1, localId: habit.id },
  })
  assert.equal(JSON.stringify(row).includes('not approved'), false)
  assert.equal(JSON.stringify(row).includes('aiApiKey'), false)
})

test('empty category maps to NULL without mutating the local habit', () => {
  const habit = sampleHabit({ category: '' })
  const before = structuredClone(habit)
  assert.equal(mapHabitToCloudRow(habit, ownerId, habitCloudId, '2025-01-04T00:00:00.000Z').category, null)
  assert.deepEqual(habit, before)
})

test('HabitLog.note maps only to habit_logs.details.note', () => {
  const log = sampleLog({ localOnly: 'do not sync' })
  const row = mapHabitLogToCloudRow(log, ownerId, logCloudId, habitCloudId, { secret: 'not approved' })
  assert.deepEqual(Object.keys(row).sort(), ['details', 'habit_id', 'id', 'log_date', 'status', 'updated_at', 'user_id'])
  assert.deepEqual(row.details, { value: log.value, note: log.note, _habitOs: { schemaVersion: 1, localId: log.id } })
  assert.equal(JSON.stringify(row).includes('do not sync'), false)
  assert.equal(JSON.stringify(row).includes('not approved'), false)
})

test('non-UUID local IDs retain stable mappings through serialization', () => {
  const first = assignCloudId(createEmptyCloudIdMap(), 'habit', 'legacy-habit-17', () => habitCloudId)
  const restored = normalizeCloudIdMap(JSON.parse(JSON.stringify(first.idMap)))
  const second = assignCloudId(restored, 'habit', 'legacy-habit-17', () => { throw new Error('must reuse existing mapping') })
  assert.equal(second.cloudId, habitCloudId)
})

test('stale conflicting ID assignments and duplicated cloud UUIDs fail closed', () => {
  const first = { version: 1, habits: { local: habitCloudId }, logs: {} }
  assert.throws(() => mergeCloudIdMaps(first, { version: 1, habits: { local: logCloudId }, logs: {} }), /Conflicting cloud IDs/)
  assert.throws(() => mergeCloudIdMaps(first, { version: 1, habits: { other: habitCloudId }, logs: {} }), /assigned to multiple local/)
})

test('owner-scoped ID-map keys are distinct', () => {
  const a = cloudIdMapStorageKeys(ownerId), b = cloudIdMapStorageKeys(otherOwnerId)
  assert.notEqual(a.idb, b.idb)
  assert.notEqual(a.localStorage, b.localStorage)
  assert.deepEqual(cloudIdMapStorageKeys(ownerId.toUpperCase()), a)
})

test('malformed maps, row IDs, and cloud UUID columns are rejected', () => {
  for (const map of [null, [], { version: 2, habits: {}, logs: {} }, { version: 1, habits: [], logs: {} },
    { version: 1, habits: { local: 'not-a-uuid' }, logs: {} },
    { version: 1, habits: { a: habitCloudId, b: habitCloudId }, logs: {} }]) assert.throws(() => normalizeCloudIdMap(map))
  assert.throws(() => mapHabitToCloudRow(sampleHabit(), ownerId, 'bad-id', '2025-01-04T00:00:00Z'), /invalid UUID/)
  assert.throws(() => mapHabitLogToCloudRow(sampleLog(), ownerId, logCloudId, 'bad-habit-id'), /invalid UUID/)
})

test('missing and malformed backup demo markers remain unknown', () => {
  const backup = { habits: [], logs: [], sessions: [], goals: [], notes: [], settings: {} }
  for (const marker of [undefined, null, 'false', 0, {}]) {
    const input = marker === undefined ? backup : { ...backup, demo: marker }
    const result = validateImported(input)
    assert.equal(result.ok, true)
    assert.equal(result.demoMarkerStatus, 'unknown')
  }
  assert.equal(inspectDemoMarker(false), 'non-demo-unconfirmed')
})

test('runtime validation rejects dates, statuses, finite numbers, timestamps, malformed records, duplicates and orphans', () => {
  const cases = [
    [sampleState({ logs: [sampleLog({ date: '2025-02-31' })] }), 'invalid-date'],
    [sampleState({ logs: [sampleLog({ status: 'none' })] }), 'invalid-status'],
    [sampleState({ logs: [sampleLog({ value: Infinity })] }), 'invalid-number'],
    [sampleState({ habits: [sampleHabit({ target: NaN })] }), 'invalid-number'],
    [sampleState({ logs: [sampleLog({ updatedAt: 'yesterday' })] }), 'invalid-timestamp'],
    [sampleState({ habits: [null] }), 'malformed-record'],
    [sampleState({ logs: [null] }), 'malformed-record'],
    [sampleState({ logs: [sampleLog({ habitId: 'missing-habit' })] }), 'missing-habit'],
    [sampleState({ habits: [sampleHabit(), sampleHabit({ name: 'duplicate' })] }), 'duplicate-id'],
    [sampleState({ logs: [sampleLog({ id: 'same' }), sampleLog({ id: 'same', date: '2025-01-04' })] }), 'duplicate-id'],
    [sampleState({ logs: [sampleLog({ id: 'a' }), sampleLog({ id: 'b', status: 'partial' })] }), 'duplicate-log-key'],
  ]
  for (const [state, code] of cases) {
    const validation = validateLocalSyncRecords(state)
    assert.ok(validation.issues.some(issue => issue.code === code), `expected ${code}`)
  }
  for (const value of [null, 42, [], { habits: null, logs: [] }, { habits: [], logs: [3] }]) {
    assert.doesNotThrow(() => assert.ok(validateLocalSyncRecords(value).issues.length))
  }
  assert.equal(validateLocalSyncRecords(sampleState({ logs: [sampleLog({ date: '2024-02-29' })] })).issues.length, 0)
})

test('JSON detail validation rejects undefined, cycles and non-finite values', () => {
  assert.equal(isJsonCompatible({ good: [1, 'text', null, true] }), true)
  assert.equal(isJsonCompatible({ bad: undefined }), false)
  assert.equal(isJsonCompatible({ bad: NaN }), false)
  assert.equal(isJsonCompatible({ bad: () => 1 }), false)
  const cycle = {}; cycle.self = cycle
  assert.equal(isJsonCompatible(cycle), false)
})

test('review proof is tied to dataset and persisted provenance generation', () => {
  const state = sampleState()
  const lock = { version: 1, ownerId }
  const provenance = { version: 1, generation: 4, markerStatus: 'non-demo-unconfirmed', lastObservedMarkerStatus: 'non-demo-unconfirmed', knownDemoHabitIds: [], knownDemoLogIds: [], unresolvedDemoHabitIds: [], unresolvedDemoLogIds: [], demoGenerationTracked: false, valid: true }
  const proof = createNonDemoReviewProof(state, ownerId, lock, provenance, true)
  assert.equal(isCurrentNonDemoReviewProof(state, ownerId, lock, provenance, proof), true)
  const changedState = structuredClone(state)
  changedState.habits[0].name = 'Changed'
  assert.equal(isCurrentNonDemoReviewProof(changedState, ownerId, lock, provenance, proof), false)
  assert.equal(isCurrentNonDemoReviewProof(state, ownerId, lock, { ...provenance, generation: 5 }, proof), false)
  const unknownState = structuredClone(state)
  delete unknownState.demo
  assert.equal(isCurrentNonDemoReviewProof(unknownState, ownerId, lock, provenance, proof), false)
})

test('known demo-generated records cannot receive a review proof', () => {
  const state = sampleState()
  const provenance = { version: 1, generation: 2, markerStatus: 'non-demo-unconfirmed', lastObservedMarkerStatus: 'non-demo-unconfirmed', knownDemoHabitIds: [], knownDemoLogIds: [sampleLog().id], unresolvedDemoHabitIds: [], unresolvedDemoLogIds: [], demoGenerationTracked: true, valid: true }
  assert.throws(() => createNonDemoReviewProof(state, ownerId, { version: 1, ownerId }, provenance, true), /Known demo-origin/)
})

test('persisted owner lock blocks account switching and corrupt lock data', async () => {
  const fake = installFakeBrowserStorage()
  try {
    assert.deepEqual(await bindSyncOwner(ownerId, true), { version: 1, ownerId })
    await assert.rejects(bindSyncOwner(otherOwnerId, true), /different owner/)
    assert.deepEqual(await loadSyncOwnerLock(), { version: 1, ownerId })
    fake.database.values.set('sync-v1:owner-lock', { version: 1, ownerId: 'corrupt' })
    await assert.rejects(loadSyncOwnerLock(), /valid authenticated owner UUID/)
  } finally { fake.restore() }
})

test('payload preparation requires a persisted owner lock', async () => {
  const fake = installFakeBrowserStorage()
  try {
    fake.database.values.set('state-v1', structuredClone(sampleState()))
    await recordDemoProvenance('non-demo-unconfirmed')
    const result = await prepareInitialSyncPayload(ownerId)
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'owner-unbound')
  } finally { fake.restore() }
})

test('stored preparation requires persisted lock, provenance and review; successful rows stay allowlisted', async () => {
  const fake = installFakeBrowserStorage()
  const state = sampleState()
  try {
    fake.database.values.set('state-v1', structuredClone(state))
    await bindSyncOwner(ownerId, true)
    await recordDemoProvenance('non-demo-unconfirmed')
    const unreviewed = await prepareInitialSyncPayload(ownerId)
    assert.equal(unreviewed.ok, false)
    assert.equal(unreviewed.reason, 'unreviewed-records')

    await confirmNonDemoDataset(ownerId, true)
    const prepared = await prepareInitialSyncPayload(ownerId)
    assert.equal(prepared.ok, true)
    assert.deepEqual(Object.keys(prepared.payload), ['habits', 'habit_logs'])
    assert.equal(prepared.payload.habit_logs[0].details.note, sampleLog().note)
    assert.equal(JSON.stringify(prepared.payload).includes('local-secret'), false)
    assert.equal(JSON.stringify(prepared.payload).includes('private journal entry'), false)
    assert.equal(JSON.stringify(prepared.payload).includes('local timer session'), false)
    assert.deepEqual(await loadCloudIdMap(ownerId), prepared.idMap)

    const changed = structuredClone(state)
    changed.logs[0].note = 'changed after proof'
    fake.database.values.set('state-v1', changed)
    const stale = await prepareInitialSyncPayload(ownerId)
    assert.equal(stale.ok, false)
    assert.equal(stale.reason, 'unreviewed-records')
  } finally { fake.restore() }
})

test('marker restore invalidates old proof; explicit unknown review can pass; known demo IDs remain blocked', async () => {
  const fake = installFakeBrowserStorage()
  const state = sampleState()
  try {
    fake.database.values.set('state-v1', structuredClone(state))
    await bindSyncOwner(ownerId, true)
    await recordDemoProvenance('non-demo-unconfirmed')
    await confirmNonDemoDataset(ownerId, true)

    const restored = structuredClone(state)
    delete restored.demo
    fake.database.values.set('state-v1', restored)
    await recordDemoProvenance('unknown', [], [], [], [], false, true)
    const stale = await prepareInitialSyncPayload(ownerId)
    assert.equal(stale.ok, false)
    assert.equal(stale.reason, 'unreviewed-records')
    await confirmNonDemoDataset(ownerId, true)
    assert.equal((await prepareInitialSyncPayload(ownerId)).ok, true)

    const demoRecord = sampleLog({ id: 'demo-log-id' })
    const nonDemoMarkerState = { ...restored, demo: false, logs: [demoRecord] }
    fake.database.values.set('state-v1', nonDemoMarkerState)
    await recordDemoProvenance('non-demo-unconfirmed', [], [demoRecord.id], [], [], true, true)
    const knownDemo = await prepareInitialSyncPayload(ownerId)
    assert.equal(knownDemo.ok, false)
    assert.equal(knownDemo.reason, 'demo-records')
    await assert.rejects(confirmNonDemoDataset(ownerId, true), /Known demo-origin/)
  } finally { fake.restore() }
})

test('map reconciliation merges fallback IDs and transaction conflicts abort without replacing them', async () => {
  const fake = installFakeBrowserStorage()
  try {
    const keys = cloudIdMapStorageKeys(ownerId)
    fake.localStorage.setItem(keys.localStorage, JSON.stringify({ version: 1, habits: { local: habitCloudId }, logs: {} }))
    const merged = await loadCloudIdMap(ownerId)
    assert.equal(merged.habits.local, habitCloudId)

    fake.database.values.set(keys.idb, { version: 1, habits: { local: logCloudId }, logs: {} })
    await assert.rejects(saveCloudIdMap(ownerId, { version: 1, habits: { local: habitCloudId }, logs: {} }), /Conflicting cloud IDs/)
    assert.equal(fake.database.values.get(keys.idb).habits.local, logCloudId)
    assert.equal(JSON.parse(fake.localStorage.getItem(keys.localStorage)).habits.local, habitCloudId)
  } finally { fake.restore() }
})

test('unreadable localStorage blocks IndexedDB map reconciliation', async () => {
  const fake = installFakeBrowserStorage()
  try {
    fake.localStorage.failRead = true
    await assert.rejects(loadCloudIdMap(ownerId), /localStorage cloud ID map/)
  } finally { fake.restore() }
})

test('missing/corrupt safety metadata, absent locks, and owner mismatch block preparation', async () => {
  const fake = installFakeBrowserStorage()
  const state = sampleState()
  try {
    fake.database.values.set('state-v1', structuredClone(state))
    const noMetadata = await prepareInitialSyncPayload(ownerId)
    assert.equal(noMetadata.ok, false)
    assert.equal(noMetadata.reason, 'demo-provenance')

    await bindSyncOwner(ownerId, true)
    await recordDemoProvenance('non-demo-unconfirmed')
    await confirmNonDemoDataset(ownerId, true)
    assert.equal((await prepareInitialSyncPayload(otherOwnerId)).reason, 'owner-mismatch')

    fake.database.values.set('sync-v1:demo-provenance', { version: 1, corrupt: true })
    const corrupt = await prepareInitialSyncPayload(ownerId)
    assert.equal(corrupt.ok, false)
    assert.equal(corrupt.reason, 'storage-unavailable')
  } finally { fake.restore() }
})

test('preparation fails closed when IndexedDB and its persisted safety lock are unavailable', async () => {
  const fake = installFakeBrowserStorage()
  try {
    globalThis.indexedDB.open = () => { throw new Error('simulated IndexedDB failure') }
    const result = await prepareInitialSyncPayload(ownerId)
    assert.equal(result.ok, false)
    assert.equal(result.reason, 'storage-unavailable')
  } finally { fake.restore() }
})

