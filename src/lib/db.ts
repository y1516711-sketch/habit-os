import type { AppState } from './types'
import {
  assignCloudId,
  blockedPayloadResult,
  cloudIdMapStorageKeys,
  createEmptyCloudIdMap,
  createNonDemoReviewProof,
  fingerprintDemoProvenance,
  inspectDemoMarker,
  isCurrentNonDemoReviewProof,
  mapHabitLogToCloudRow,
  mapHabitToCloudRow,
  mergeCloudIdMaps,
  normalizeSyncOwnerLock,
  normalizeCloudIdMap,
  normalizeOwnerId,
  validateLocalSyncRecords,
  type DemoProvenanceSnapshot,
  type DemoMarkerStatus,
  type CloudIdMap,
  type HabitCloudRow,
  type HabitLogCloudRow,
  type InitialPayloadResult,
  type NonDemoReviewProof,
  type SyncOwnerLock,
} from './cloudSync.ts'
// Persistent storage: IndexedDB (survives restarts, large quota, free, on-device).
// Falls back to localStorage if IndexedDB is unavailable (private mode etc.).
const DB = 'habit-os-db', STORE = 'kv', KEY = 'state-v1', LS_KEY = 'habit-os-state-v1'
const OWNER_LOCK_KEY = 'sync-v1:owner-lock'
const DEMO_PROVENANCE_KEY = 'sync-v1:demo-provenance'

export interface DemoProvenanceMetadata extends DemoProvenanceSnapshot {
  valid: boolean
}

const emptyDemoProvenance = (): DemoProvenanceMetadata => ({
  version: 1, generation: 0, markerStatus: 'unknown', lastObservedMarkerStatus: 'unknown',
  knownDemoHabitIds: [], knownDemoLogIds: [], unresolvedDemoHabitIds: [], unresolvedDemoLogIds: [],
  demoGenerationTracked: false, valid: true,
})

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}
export async function loadState(): Promise<AppState | null> {
  try {
    const db = await openDb()
    const val = await new Promise<unknown>((res, rej) => {
      const rq = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
      rq.onsuccess = () => res(rq.result ?? null); rq.onerror = () => rej(rq.error)
    })
    db.close()
    if (val && typeof val === 'object') return val as AppState
  } catch { /* fall through */ }
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as AppState) : null
  } catch { return null }
}

function parseCloudIdMap(raw: string): CloudIdMap {
  try { return normalizeCloudIdMap(JSON.parse(raw)) }
  catch { throw new Error('The saved cloud ID map is invalid; sync is blocked to protect existing mappings.') }
}

function parseDemoProvenance(value: unknown): DemoProvenanceMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Demo provenance metadata is malformed.')
  const item = value as Record<string, unknown>
  const allowed = ['demo-present', 'non-demo-unconfirmed', 'unknown']
  const generation = item.generation === undefined ? 0 : item.generation
  const lastObservedMarkerStatus = item.lastObservedMarkerStatus === undefined ? item.markerStatus : item.lastObservedMarkerStatus
  if (item.version !== 1 || !allowed.includes(String(item.markerStatus)) || !allowed.includes(String(lastObservedMarkerStatus))
    || item.markerStatus !== lastObservedMarkerStatus
    || !Number.isSafeInteger(generation) || (generation as number) < 0
    || !Array.isArray(item.knownDemoHabitIds) || !item.knownDemoHabitIds.every(id => typeof id === 'string')
    || !Array.isArray(item.knownDemoLogIds) || !item.knownDemoLogIds.every(id => typeof id === 'string')
    || !Array.isArray(item.unresolvedDemoHabitIds) || !item.unresolvedDemoHabitIds.every(id => typeof id === 'string')
    || !Array.isArray(item.unresolvedDemoLogIds) || !item.unresolvedDemoLogIds.every(id => typeof id === 'string')
    || typeof item.demoGenerationTracked !== 'boolean') {
    throw new Error('Demo provenance metadata is malformed.')
  }
  const reviewProof = item.reviewProof === undefined ? undefined : parseReviewProof(item.reviewProof)
  const knownDemoHabitIds = [...new Set(item.knownDemoHabitIds as string[])]
  const knownDemoLogIds = [...new Set(item.knownDemoLogIds as string[])]
  const unresolvedDemoHabitIds = [...new Set(item.unresolvedDemoHabitIds as string[])]
  const unresolvedDemoLogIds = [...new Set(item.unresolvedDemoLogIds as string[])]
  if (knownDemoHabitIds.some(id => unresolvedDemoHabitIds.includes(id))
    || knownDemoLogIds.some(id => unresolvedDemoLogIds.includes(id))) {
    throw new Error('Demo provenance metadata is internally inconsistent.')
  }
  const result: DemoProvenanceMetadata = {
    version: 1,
    generation: generation as number,
    markerStatus: item.markerStatus as DemoMarkerStatus,
    lastObservedMarkerStatus: lastObservedMarkerStatus as DemoMarkerStatus,
    knownDemoHabitIds,
    knownDemoLogIds,
    unresolvedDemoHabitIds,
    unresolvedDemoLogIds,
    demoGenerationTracked: item.demoGenerationTracked,
    ...(reviewProof ? { reviewProof } : {}),
    valid: true,
  }
  if (reviewProof && (reviewProof.provenanceGeneration !== result.generation
    || reviewProof.rawDemoMarkerStatus !== result.lastObservedMarkerStatus
    || reviewProof.provenanceFingerprint !== fingerprintDemoProvenance(result))) {
    throw new Error('Persisted review proof does not match demo provenance metadata.')
  }
  return result
}

function parseReviewProof(value: unknown): NonDemoReviewProof {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Persisted review proof is malformed.')
  const proof = value as Record<string, unknown>
  if (proof.version !== 1 || typeof proof.ownerId !== 'string' || proof.demoProvenance !== 'confirmed-non-demo'
    || !Array.isArray(proof.reviewedHabitIds) || !proof.reviewedHabitIds.every(id => typeof id === 'string')
    || !Array.isArray(proof.reviewedLogIds) || !proof.reviewedLogIds.every(id => typeof id === 'string')
    || new Set(proof.reviewedHabitIds as string[]).size !== proof.reviewedHabitIds.length
    || new Set(proof.reviewedLogIds as string[]).size !== proof.reviewedLogIds.length
    || typeof proof.datasetFingerprint !== 'string' || !/^[0-9a-f]{16}$/.test(proof.datasetFingerprint)
    || !['demo-present', 'non-demo-unconfirmed', 'unknown'].includes(String(proof.rawDemoMarkerStatus))
    || !Number.isSafeInteger(proof.provenanceGeneration) || (proof.provenanceGeneration as number) < 0
    || typeof proof.provenanceFingerprint !== 'string' || !/^[0-9a-f]{16}$/.test(proof.provenanceFingerprint)) {
    throw new Error('Persisted review proof is malformed.')
  }
  if (normalizeOwnerId(proof.ownerId) !== proof.ownerId.toLowerCase()) throw new Error('Persisted review proof owner is malformed.')
  return proof as unknown as NonDemoReviewProof
}

function mergeDemoProvenance(
  a: DemoProvenanceMetadata,
  b: DemoProvenanceMetadata,
  forceInvalidateReview: boolean,
  reconcileStoredGeneration = false,
): DemoProvenanceMetadata {
  if (reconcileStoredGeneration
    && ((!!a.reviewProof !== !!b.reviewProof)
      || (a.reviewProof && b.reviewProof && JSON.stringify(a.reviewProof) !== JSON.stringify(b.reviewProof)))) {
    throw new Error('Demo provenance stores contain inconsistent review proofs; sync is blocked.')
  }
  const knownDemoHabitIds = [...new Set([...a.knownDemoHabitIds, ...b.knownDemoHabitIds])]
  const knownDemoLogIds = [...new Set([...a.knownDemoLogIds, ...b.knownDemoLogIds])]
  const mergedContent = {
    version: 1 as const,
    markerStatus: b.markerStatus,
    lastObservedMarkerStatus: b.lastObservedMarkerStatus,
    knownDemoHabitIds,
    knownDemoLogIds,
    unresolvedDemoHabitIds: [...new Set([...a.unresolvedDemoHabitIds, ...b.unresolvedDemoHabitIds])].filter(id => !knownDemoHabitIds.includes(id)),
    unresolvedDemoLogIds: [...new Set([...a.unresolvedDemoLogIds, ...b.unresolvedDemoLogIds])].filter(id => !knownDemoLogIds.includes(id)),
    demoGenerationTracked: a.demoGenerationTracked || b.demoGenerationTracked,
  }
  const priorContent = {
    version: a.version, markerStatus: a.markerStatus, lastObservedMarkerStatus: a.lastObservedMarkerStatus,
    knownDemoHabitIds: [...a.knownDemoHabitIds].sort(), knownDemoLogIds: [...a.knownDemoLogIds].sort(),
    unresolvedDemoHabitIds: [...a.unresolvedDemoHabitIds].sort(), unresolvedDemoLogIds: [...a.unresolvedDemoLogIds].sort(),
    demoGenerationTracked: a.demoGenerationTracked,
  }
  const nextContent = {
    ...mergedContent,
    knownDemoHabitIds: [...mergedContent.knownDemoHabitIds].sort(),
    knownDemoLogIds: [...mergedContent.knownDemoLogIds].sort(),
    unresolvedDemoHabitIds: [...mergedContent.unresolvedDemoHabitIds].sort(),
    unresolvedDemoLogIds: [...mergedContent.unresolvedDemoLogIds].sort(),
  }
  const invalidate = forceInvalidateReview
    || (reconcileStoredGeneration && a.generation !== b.generation)
    || JSON.stringify(priorContent) !== JSON.stringify(nextContent)
  return {
    ...mergedContent,
    generation: Math.max(a.generation, b.generation) + (invalidate ? 1 : 0),
    ...(!invalidate && (b.reviewProof ?? a.reviewProof) ? { reviewProof: b.reviewProof ?? a.reviewProof } : {}),
    valid: a.valid && b.valid,
  }
}

function withWebLock<T>(name: string, action: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as Navigator & { locks?: { request<R>(name: string, options: { mode: 'exclusive' }, callback: () => Promise<R>): Promise<R> } } | undefined)?.locks
  if (!locks) return Promise.reject(new Error('Cross-tab-safe localStorage locking is unavailable; sync metadata was not changed.'))
  return locks.request(name, { mode: 'exclusive' }, action)
}

function mergeIdMapInTransaction(db: IDBDatabase, key: string, candidate: CloudIdMap): Promise<CloudIdMap> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    const store = transaction.objectStore(STORE)
    let merged: CloudIdMap | undefined
    let operationError: Error | undefined
    const request = store.get(key)
    request.onsuccess = () => {
      try {
        const current = request.result == null ? createEmptyCloudIdMap() : normalizeCloudIdMap(request.result)
        merged = mergeCloudIdMaps(current, candidate)
        store.put(merged, key)
      } catch (error) {
        operationError = error instanceof Error ? error : new Error('Cloud ID map conflict detected.')
        transaction.abort()
      }
    }
    request.onerror = () => { operationError = request.error ?? new Error('Could not read the stored cloud ID map.'); transaction.abort() }
    transaction.oncomplete = () => merged ? resolve(merged) : reject(new Error('Cloud ID map transaction completed without a result.'))
    transaction.onerror = () => reject(operationError ?? transaction.error ?? new Error('Cloud ID map transaction failed.'))
    transaction.onabort = () => reject(operationError ?? transaction.error ?? new Error('Cloud ID map transaction was aborted.'))
  })
}

function readStoredValue(db: IDBDatabase, key: string): Promise<unknown | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readonly')
    const request = transaction.objectStore(STORE).get(key)
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => reject(request.error ?? new Error(`Could not read ${key}.`))
  })
}

function readLocalIdMap(key: string): CloudIdMap {
  let raw: string | null
  try { raw = localStorage.getItem(key) }
  catch { throw new Error('Could not read the localStorage cloud ID map; reconciliation is blocked.') }
  return raw === null ? createEmptyCloudIdMap() : parseCloudIdMap(raw)
}

async function reconcileCloudIdMap(
  ownerId: string,
  idb: IDBDatabase | null,
  candidate: CloudIdMap = createEmptyCloudIdMap(),
): Promise<CloudIdMap> {
  const keys = cloudIdMapStorageKeys(ownerId)
  return withWebLock(`habit-os:${keys.localStorage}`, async () => {
    const localMap = readLocalIdMap(keys.localStorage)
    const additions = mergeCloudIdMaps(localMap, candidate)
    if (!idb) {
      const merged = additions
      try { localStorage.setItem(keys.localStorage, JSON.stringify(merged)) }
      catch { throw new Error('Could not persist the fallback cloud ID map safely.') }
      return merged
    }
    const merged = await mergeIdMapInTransaction(idb, keys.idb, additions)
    try { localStorage.setItem(keys.localStorage, JSON.stringify(merged)) }
    catch { throw new Error('IndexedDB mapping was saved, but localStorage reconciliation failed; sync is blocked.') }
    return merged
  })
}

/**
 * Read sync metadata. The existing `state-v1` value and local app state are
 * never modified. IndexedDB transactions serialize mapping merges across tabs.
 */
export async function loadCloudIdMap(ownerId: string): Promise<CloudIdMap> {
  const keys = cloudIdMapStorageKeys(ownerId)
  let db: IDBDatabase
  try { db = await openDb() }
  catch { return reconcileCloudIdMap(ownerId, null) }
  try { return await reconcileCloudIdMap(ownerId, db) }
  finally { db.close() }
}

/** Atomically merge owner-scoped mappings; conflicting assignments abort. */
export async function saveCloudIdMap(ownerId: string, cloudIdMap: CloudIdMap): Promise<CloudIdMap> {
  const safeMap = normalizeCloudIdMap(cloudIdMap)
  let db: IDBDatabase
  try { db = await openDb() }
  catch { return reconcileCloudIdMap(ownerId, null, safeMap) }
  try { return await reconcileCloudIdMap(ownerId, db, safeMap) }
  finally { db.close() }
}

/** A permanent owner lock: it is never removed on logout or local-state reset. */
export async function loadSyncOwnerLock(): Promise<SyncOwnerLock | null> {
  const db = await openDb()
  try {
    const value = await readStoredValue(db, OWNER_LOCK_KEY)
    return value == null ? null : normalizeSyncOwnerLock(value)
  } finally { db.close() }
}

export async function bindSyncOwner(ownerId: string, explicitlyConfirmedLocalDataset: boolean): Promise<SyncOwnerLock> {
  if (!explicitlyConfirmedLocalDataset) throw new Error('Explicit confirmation is required before binding local data to an owner.')
  const normalizedOwnerId = normalizeOwnerId(ownerId)
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite')
      const store = transaction.objectStore(STORE)
      let result: SyncOwnerLock | undefined
      let operationError: Error | undefined
      const request = store.get(OWNER_LOCK_KEY)
      request.onsuccess = () => {
        try {
          const current = request.result == null ? null : normalizeSyncOwnerLock(request.result)
          if (current && current.ownerId !== normalizedOwnerId) {
            throw new Error('This local dataset is already locked to a different owner; account switching is blocked.')
          }
          result = current ?? { version: 1, ownerId: normalizedOwnerId }
          if (current === null) store.put(result, OWNER_LOCK_KEY)
        } catch (error) {
          operationError = error instanceof Error ? error : new Error('Owner lock conflict detected.')
          transaction.abort()
        }
      }
      request.onerror = () => { operationError = request.error ?? new Error('Could not read the sync owner lock.'); transaction.abort() }
      transaction.oncomplete = () => result ? resolve(result) : reject(new Error('Owner lock transaction completed without a result.'))
      transaction.onerror = () => reject(operationError ?? transaction.error ?? new Error('Owner lock transaction failed.'))
      transaction.onabort = () => reject(operationError ?? transaction.error ?? new Error('Owner lock transaction was aborted.'))
    })
  } finally { db.close() }
}

function readLocalDemoProvenance(): DemoProvenanceMetadata | null {
  let raw: string | null
  try { raw = localStorage.getItem(DEMO_PROVENANCE_KEY) }
  catch { throw new Error('Could not read local demo provenance; sync is blocked.') }
  return raw === null ? null : parseDemoProvenance(JSON.parse(raw))
}

function persistedProvenanceValue(metadata: DemoProvenanceMetadata): Record<string, unknown> {
  const { valid: _valid, ...persisted } = metadata
  return persisted
}

function mergeDemoProvenanceInTransaction(
  db: IDBDatabase,
  localFallback: DemoProvenanceMetadata | null,
  candidate: DemoProvenanceMetadata | null,
  forceInvalidateReview = false,
): Promise<DemoProvenanceMetadata> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    const store = transaction.objectStore(STORE)
    let result: DemoProvenanceMetadata | undefined
    let operationError: Error | undefined
    const request = store.get(DEMO_PROVENANCE_KEY)
    request.onsuccess = () => {
      try {
        const stored = request.result == null ? null : parseDemoProvenance(request.result)
        if (!stored && !localFallback && !candidate) {
          result = { ...emptyDemoProvenance(), valid: false }
          return
        }
        let merged = stored
          ? localFallback ? mergeDemoProvenance(localFallback, stored, false, true) : stored
          : localFallback ?? emptyDemoProvenance()
        if (candidate) merged = mergeDemoProvenance(merged, candidate, forceInvalidateReview)
        result = { ...merged, valid: true }
        store.put(persistedProvenanceValue(result), DEMO_PROVENANCE_KEY)
      } catch (error) {
        operationError = error instanceof Error ? error : new Error('Demo provenance conflict detected.')
        transaction.abort()
      }
    }
    request.onerror = () => { operationError = request.error ?? new Error('Could not read demo provenance metadata.'); transaction.abort() }
    transaction.oncomplete = () => result ? resolve(result) : reject(new Error('Demo provenance transaction completed without a result.'))
    transaction.onerror = () => reject(operationError ?? transaction.error ?? new Error('Demo provenance transaction failed.'))
    transaction.onabort = () => reject(operationError ?? transaction.error ?? new Error('Demo provenance transaction was aborted.'))
  })
}

/** Read only provenance sidecar; malformed data is returned invalid and blocks sync. */
export async function loadDemoProvenanceMetadata(): Promise<DemoProvenanceMetadata> {
  const db = await openDb()
  try {
    return await withWebLock('habit-os:demo-provenance', async () => {
      const localFallback = readLocalDemoProvenance()
      const merged = await mergeDemoProvenanceInTransaction(db, localFallback, null)
      if (!merged.valid) return merged
      try { localStorage.setItem(DEMO_PROVENANCE_KEY, JSON.stringify(persistedProvenanceValue(merged))) }
      catch { throw new Error('Could not reconcile persisted demo provenance across stores.') }
      return merged
    })
  } finally { db.close() }
}

/** Persist demo provenance separately without modifying the state-v1 record. */
export async function recordDemoProvenance(
  markerStatus: DemoMarkerStatus,
  knownDemoHabitIds: readonly string[] = [],
  knownDemoLogIds: readonly string[] = [],
  unresolvedDemoHabitIds: readonly string[] = [],
  unresolvedDemoLogIds: readonly string[] = [],
  demoGenerationTracked = false,
  forceInvalidateReview = false,
): Promise<DemoProvenanceMetadata> {


  const allIds = [
    ...knownDemoHabitIds,
    ...knownDemoLogIds,
    ...unresolvedDemoHabitIds,
    ...unresolvedDemoLogIds,
  ]

  if (allIds.some(id => typeof id !== 'string' || !id.trim())) {
    throw new Error('Demo record IDs must be non-empty strings.')
  }

  const candidate: DemoProvenanceMetadata = {
    version: 1, generation: 0, markerStatus, lastObservedMarkerStatus: markerStatus,
    knownDemoHabitIds: [...knownDemoHabitIds], knownDemoLogIds: [...knownDemoLogIds],
    unresolvedDemoHabitIds: [...unresolvedDemoHabitIds], unresolvedDemoLogIds: [...unresolvedDemoLogIds],
    demoGenerationTracked, valid: true,
  }
  let db: IDBDatabase
  try { db = await openDb() }
  catch {
    return withWebLock('habit-os:demo-provenance', async () => {
      const current = readLocalDemoProvenance() ?? emptyDemoProvenance()
      const merged = mergeDemoProvenance(current, candidate, forceInvalidateReview)
      try { localStorage.setItem(DEMO_PROVENANCE_KEY, JSON.stringify(persistedProvenanceValue(merged))) }
      catch { throw new Error('Could not persist local demo provenance; sync is blocked.') }
      return merged
    })
  }
  try {
    return await withWebLock('habit-os:demo-provenance', async () => {
      const fallback = readLocalDemoProvenance()
      const merged = await mergeDemoProvenanceInTransaction(db, fallback, candidate, forceInvalidateReview)
      try { localStorage.setItem(DEMO_PROVENANCE_KEY, JSON.stringify(persistedProvenanceValue(merged))) }
      catch { throw new Error('Could not reconcile persisted demo provenance across stores.') }
      return merged
    })
  }
  finally { db.close() }
}

function persistNonDemoReviewProof(proof: NonDemoReviewProof): Promise<void> {
  return new Promise(async (resolve, reject) => {
    let db: IDBDatabase
    try { db = await openDb() }
    catch (error) { reject(error); return }
    try {
      await withWebLock('habit-os:demo-provenance', async () => {
        await new Promise<void>((txResolve, txReject) => {
        let fallback: DemoProvenanceMetadata | null
        try { fallback = readLocalDemoProvenance() }
        catch (error) { txReject(error); return }
        const transaction = db.transaction(STORE, 'readwrite')
        const store = transaction.objectStore(STORE)
        const metadataRequest = store.get(DEMO_PROVENANCE_KEY)
        const ownerRequest = store.get(OWNER_LOCK_KEY)
        let metadata: DemoProvenanceMetadata | undefined
        let operationError: Error | undefined
        let remaining = 2
        const checkReady = () => {
          if (--remaining !== 0) return
          try {
            if (!metadata) throw new Error('Persisted demo provenance is missing.')
            const reconciled = fallback ? mergeDemoProvenance(fallback, metadata, false, true) : metadata
            if (proof.provenanceGeneration !== reconciled.generation
              || proof.provenanceFingerprint !== fingerprintDemoProvenance(reconciled)) {
              throw new Error('Demo provenance changed while the review was being saved.')
            }
            const owner = ownerRequest.result == null ? null : normalizeSyncOwnerLock(ownerRequest.result)
            if (!owner || owner.ownerId !== proof.ownerId) throw new Error('Persisted owner lock does not match the review proof.')
            const result = { ...reconciled, reviewProof: proof }
            store.put(persistedProvenanceValue(result), DEMO_PROVENANCE_KEY)
          } catch (error) {
            operationError = error instanceof Error ? error : new Error('Could not persist the review proof.')
            transaction.abort()
          }
        }
        metadataRequest.onsuccess = () => {
          try {
            const stored = metadataRequest.result == null ? undefined : parseDemoProvenance(metadataRequest.result)
            metadata = stored && fallback ? mergeDemoProvenance(fallback, stored, false, true) : stored
          }
          catch (error) {
            operationError = error instanceof Error ? error : new Error('Persisted provenance is malformed.')
            transaction.abort()
            return
          }
          checkReady()
        }
        ownerRequest.onsuccess = checkReady
        metadataRequest.onerror = () => { operationError = metadataRequest.error ?? new Error('Could not read provenance.'); transaction.abort() }
        ownerRequest.onerror = () => { operationError = ownerRequest.error ?? new Error('Could not read owner lock.'); transaction.abort() }
        transaction.oncomplete = () => txResolve()
        transaction.onerror = () => txReject(operationError ?? transaction.error ?? new Error('Review proof transaction failed.'))
        transaction.onabort = () => txReject(operationError ?? transaction.error ?? new Error('Review proof transaction was aborted.'))
        })
        const value = await readStoredValue(db, DEMO_PROVENANCE_KEY)
        if (value == null) throw new Error('Persisted review proof disappeared after save.')
        const metadata = parseDemoProvenance(value)
        try { localStorage.setItem(DEMO_PROVENANCE_KEY, JSON.stringify(persistedProvenanceValue(metadata))) }
        catch { throw new Error('Could not reconcile the persisted review proof across stores.') }
      })
      resolve()
    } catch (error) { reject(error) }
    finally { db.close() }
  })
}

/** Explicitly review all records and persist a proof against stored provenance and owner. */
export async function confirmNonDemoDataset(
  ownerId: string,
  explicitlyReviewedEveryRecord: boolean,
): Promise<NonDemoReviewProof> {
  const [state, ownerLock, provenance] = await Promise.all([loadState(), loadSyncOwnerLock(), loadDemoProvenanceMetadata()])
  if (!state) throw new Error('No persisted local dataset is available to review.')
  if (!ownerLock) throw new Error('A persisted owner lock is required before reviewing data for sync.')
  const proof = createNonDemoReviewProof(state, ownerId, ownerLock, provenance, explicitlyReviewedEveryRecord)
  await persistNonDemoReviewProof(proof)
  return proof
}

/**
 * The public payload-preparation boundary always loads provenance, review
 * proof, owner lock and ID mappings from persisted storage before mapping rows.
 */
export async function prepareInitialSyncPayload(
  userId: string,
): Promise<InitialPayloadResult> {
  let stateValue: AppState | null
  let provenance: DemoProvenanceMetadata
  let ownerLock: SyncOwnerLock | null
  let idMap: CloudIdMap
  try {
    ;[stateValue, provenance, ownerLock, idMap] = await Promise.all([
      loadState(), loadDemoProvenanceMetadata(), loadSyncOwnerLock(), loadCloudIdMap(userId),
    ])
  } catch (error) {
    return blockedPayloadResult('storage-unavailable', [{
      path: 'storage', code: 'safety-storage-unavailable',
      message: error instanceof Error ? error.message : 'Required safety metadata could not be loaded.',
    }])
  }

  if (!stateValue) {
    return blockedPayloadResult('storage-unavailable', [{ path: 'state', code: 'local-state-unavailable', message: 'No persisted local state is available for sync preparation.' }], [], [], idMap)
  }

  const checked = validateLocalSyncRecords(stateValue)
  if (checked.issues.length) {
    const reason = checked.duplicateLogGroups.length ? 'duplicate-log-keys'
      : checked.duplicateRecordIds.length ? 'duplicate-record-ids' : 'invalid-records'
    return blockedPayloadResult(reason, checked.issues, checked.duplicateLogGroups, checked.duplicateRecordIds, idMap)
  }
  const state = checked.state!
  if (state.demo === true || (state.demo !== undefined && typeof state.demo !== 'boolean')) {
    return blockedPayloadResult('demo-provenance', [{ path: 'demo', code: 'demo-marker-blocked', message: 'Demo or malformed demo markers block payload preparation.' }], [], [], idMap)
  }
  if (!provenance.valid) {
    return blockedPayloadResult('demo-provenance', [{ path: 'demoProvenance', code: 'provenance-unavailable', message: 'Persisted demo provenance is missing or unverified.' }], [], [], idMap)
  }
  if (inspectDemoMarker(state.demo) !== provenance.lastObservedMarkerStatus) {
    return blockedPayloadResult('demo-provenance', [{ path: 'demoProvenance', code: 'marker-mismatch', message: 'Current state and persisted demo marker provenance disagree.' }], [], [], idMap)
  }
  if (checked.habits.some(h => provenance.knownDemoHabitIds.includes(h.id))
    || checked.logs.some(l => provenance.knownDemoLogIds.includes(l.id))) {
    return blockedPayloadResult('demo-records', [{ path: 'demoProvenance', code: 'demo-record-present', message: 'Known demo-generated records cannot be included in a cloud payload.' }], [], [], idMap)
  }
  if (!ownerLock) {
    return blockedPayloadResult('owner-unbound', [{ path: 'ownerLock', code: 'owner-unbound', message: 'No persisted owner lock exists for this local dataset.' }], [], [], idMap)
  }
  let normalizedOwnerId: string
  try { normalizedOwnerId = normalizeOwnerId(userId) }
  catch (error) {
    return blockedPayloadResult('owner-mismatch', [{ path: 'userId', code: 'invalid-owner-id', message: error instanceof Error ? error.message : 'Owner ID is invalid.' }], [], [], idMap)
  }
  if (ownerLock.ownerId !== normalizedOwnerId) {
    return blockedPayloadResult('owner-mismatch', [{ path: 'ownerLock.ownerId', code: 'owner-mismatch', message: 'Persisted owner lock belongs to another account.' }], [], [], idMap)
  }
  if (!provenance.reviewProof || !isCurrentNonDemoReviewProof(state, normalizedOwnerId, ownerLock, provenance, provenance.reviewProof)) {
    return blockedPayloadResult('unreviewed-records', [{ path: 'reviewProof', code: 'stale-or-missing-proof', message: 'Persisted review proof is missing or stale for this owner, data and provenance generation.' }], [], [], idMap)
  }

  try {
    let nextMap = idMap
    const cloudUpdatedAt = new Date().toISOString()
    const cloudHabitIds = new Map<string, string>()
    const habits: HabitCloudRow[] = []
    for (const habit of checked.habits) {
      const assigned = assignCloudId(nextMap, 'habit', habit.id)
      nextMap = assigned.idMap
      cloudHabitIds.set(habit.id, assigned.cloudId)
      habits.push(mapHabitToCloudRow(habit, normalizedOwnerId, assigned.cloudId, cloudUpdatedAt))
    }
    const habit_logs: HabitLogCloudRow[] = []
    for (const log of checked.logs) {
      const cloudHabitId = cloudHabitIds.get(log.habitId)
      if (!cloudHabitId) {
        return blockedPayloadResult('invalid-records', [{ path: `logs.${log.id}.habitId`, code: 'missing-habit', message: 'Log references a missing habit.' }], [], [], nextMap)
      }
      const assigned = assignCloudId(nextMap, 'log', log.id)
      nextMap = assigned.idMap
      habit_logs.push(mapHabitLogToCloudRow(log, normalizedOwnerId, assigned.cloudId, cloudHabitId))
    }
    const persistedMap = await saveCloudIdMap(normalizedOwnerId, nextMap)
    return { ok: true, payload: { habits, habit_logs }, idMap: persistedMap, duplicateLogGroups: [], duplicateRecordIds: [], errors: [] }
  } catch (error) {
    return blockedPayloadResult('invalid-id-map', [{ path: 'idMap', code: 'mapping-or-row-error', message: error instanceof Error ? error.message : 'Could not safely prepare mappings.' }], [], [], idMap)
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
export function saveState(state: AppState): void {
  // Debounced write; also mirror to localStorage as a safety net.
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)) } catch { /* quota */ }
    try {
      const db = await openDb()
      await new Promise<void>((res, rej) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(state, KEY)
        tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error)
      })
      db.close()
    } catch { /* localStorage copy still saved */ }
  }, 250)
}
export async function clearState(): Promise<void> {
  try { localStorage.removeItem(LS_KEY) } catch { /* noop */ }
  try {
    const db = await openDb()
    await new Promise<void>((res) => {
      const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = () => res(); tx.onerror = () => res()
    }); db.close()
  } catch { /* noop */ }
}
export function validateImported(data: unknown): { ok: boolean; error?: string; state?: AppState; demoMarker?: unknown; demoMarkerStatus?: DemoMarkerStatus } {
  if (!data || typeof data !== 'object') return { ok: false, error: 'File does not contain a JSON object.' }
  const s = data as Record<string, unknown>
  for (const k of ['habits', 'logs', 'sessions', 'goals', 'notes', 'settings']) {
    if (!(k in s)) return { ok: false, error: `Missing required field: "${k}". This is not a HABIT OS backup.` }
  }
  if (!Array.isArray(s.habits) || !Array.isArray(s.logs)) return { ok: false, error: '"habits" and "logs" must be arrays.' }
  for (const h of s.habits as Record<string, unknown>[]) {
    if (!h || typeof h.id !== 'string' || typeof h.name !== 'string') return { ok: false, error: 'A habit is missing its id or name.' }
  }
  for (const l of s.logs as Record<string, unknown>[]) {
    if (!l || typeof l.habitId !== 'string' || typeof l.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(l.date)) {
      return { ok: false, error: 'A log has an invalid date (expected YYYY-MM-DD).' }
    }
  }
  return { ok: true, state: data as AppState, demoMarker: s.demo, demoMarkerStatus: inspectDemoMarker(s.demo) }
}
