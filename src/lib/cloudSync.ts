import type { Habit, HabitLog } from './types'

export type CloudIdEntity = 'habit' | 'log'
export type DemoMarkerStatus = 'demo-present' | 'non-demo-unconfirmed' | 'unknown'
export type CloudIdMap = {
  version: 1
  habits: Record<string, string>
  logs: Record<string, string>
}

type JsonObject = Record<string, unknown>

export interface HabitCloudRow {
  id: string
  user_id: string
  name: string
  category: string | null
  details: JsonObject
  updated_at: string
}

export interface HabitLogCloudRow {
  id: string
  user_id: string
  habit_id: string
  log_date: string
  status: HabitLog['status']
  details: JsonObject
  updated_at: string
}

export interface HabitsAndLogsPayload {
  habits: HabitCloudRow[]
  habit_logs: HabitLogCloudRow[]
}

export interface DuplicateLogGroup {
  habitId: string
  date: string
  records: HabitLog[]
}

export interface DuplicateRecordId {
  entity: CloudIdEntity
  id: string
  count: number
}

export interface SyncOwnerLock {
  version: 1
  ownerId: string
}

export interface NonDemoReviewProof {
  version: 1
  ownerId: string
  demoProvenance: 'confirmed-non-demo'
  reviewedHabitIds: string[]
  reviewedLogIds: string[]
  datasetFingerprint: string
  rawDemoMarkerStatus: DemoMarkerStatus
  provenanceGeneration: number
  provenanceFingerprint: string
}

export interface DemoProvenanceSnapshot {
  version: 1
  generation: number
  markerStatus: DemoMarkerStatus
  knownDemoHabitIds: string[]
  knownDemoLogIds: string[]
  unresolvedDemoHabitIds: string[]
  unresolvedDemoLogIds: string[]
  demoGenerationTracked: boolean
  lastObservedMarkerStatus: DemoMarkerStatus
  reviewProof?: NonDemoReviewProof
  valid: boolean
}

export interface SyncValidationIssue {
  path: string
  code: string
  message: string
}

export type InitialPayloadResult =
  | {
      ok: true
      payload: HabitsAndLogsPayload
      idMap: CloudIdMap
      duplicateLogGroups: []
      duplicateRecordIds: []
      errors: []
    }
  | {
      ok: false
      reason:
        | 'invalid-records'
        | 'demo-provenance'
        | 'demo-records'
        | 'owner-unbound'
        | 'owner-mismatch'
        | 'unreviewed-records'
        | 'duplicate-log-keys'
        | 'duplicate-record-ids'
        | 'invalid-id-map'
        | 'storage-unavailable'
      idMap: CloudIdMap
      duplicateLogGroups: DuplicateLogGroup[]
      duplicateRecordIds: DuplicateRecordId[]
      errors: SyncValidationIssue[]
    }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CLOUD_ID_MAP_PREFIX = 'sync-v1:cloud-id-map:'
const LS_CLOUD_ID_MAP_PREFIX = 'habit-os-sync-id-map-v1:'

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function normalizeOwnerId(ownerId: string): string {
  if (typeof ownerId !== 'string' || !UUID_PATTERN.test(ownerId)) {
    throw new Error('A valid authenticated owner UUID is required for cloud sync.')
  }
  return ownerId.toLowerCase()
}

export function inspectDemoMarker(value: unknown): DemoMarkerStatus {
  if (value === true) return 'demo-present'
  if (value === false) return 'non-demo-unconfirmed'
  return 'unknown'
}

export function normalizeSyncOwnerLock(input: unknown): SyncOwnerLock {
  if (!isPlainRecord(input) || input.version !== 1) throw new Error('The saved sync owner lock is invalid.')
  return { version: 1, ownerId: normalizeOwnerId(input.ownerId as string) }
}

export function cloudIdMapStorageKeys(ownerId: string): { idb: string; localStorage: string } {
  const ownerKey = encodeURIComponent(normalizeOwnerId(ownerId))
  return {
    idb: `${CLOUD_ID_MAP_PREFIX}${ownerKey}`,
    localStorage: `${LS_CLOUD_ID_MAP_PREFIX}${ownerKey}`,
  }
}

function emptyRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>
}

export function createEmptyCloudIdMap(): CloudIdMap {
  return { version: 1, habits: emptyRecord<string>(), logs: emptyRecord<string>() }
}

function assertLocalId(localId: string): void {
  if (typeof localId !== 'string' || localId.length === 0) {
    throw new Error('A local record is missing its ID; no cloud mapping was created.')
  }
}

function assertCloudUuid(cloudId: string): string {
  if (typeof cloudId !== 'string' || !UUID_PATTERN.test(cloudId)) {
    throw new Error('The cloud ID mapping contains an invalid UUID.')
  }
  return cloudId.toLowerCase()
}

function copyValidatedMap(input: unknown): CloudIdMap {
  if (!isPlainRecord(input)) throw new Error('The saved cloud ID map is invalid.')
  const value = input as Partial<CloudIdMap>
  if (value.version !== 1
    || !isPlainRecord(value.habits)
    || !isPlainRecord(value.logs)) {
    throw new Error('The saved cloud ID map has an unsupported format.')
  }

  const result = createEmptyCloudIdMap()
  for (const entity of ['habits', 'logs'] as const) {
    for (const [localId, cloudId] of Object.entries(value[entity] as Record<string, unknown>)) {
      assertLocalId(localId)
      result[entity][localId] = assertCloudUuid(cloudId as string)
    }
  }
  return result
}

/** Validate a map loaded from JSON/IndexedDB before it is used for any upload. */
export function normalizeCloudIdMap(input: unknown): CloudIdMap {
  const validated = copyValidatedMap(input)
  return mergeCloudIdMaps(validated)
}

/** Merge maps without silently resolving mapping conflicts. */
export function mergeCloudIdMaps(...inputs: unknown[]): CloudIdMap {
  const result = createEmptyCloudIdMap()
  for (const input of inputs) {
    if (input == null) continue
    const validated = copyValidatedMap(input)
    for (const entity of ['habits', 'logs'] as const) {
      const reverse = new Map(Object.entries(result[entity]).map(([localId, cloudId]) => [cloudId, localId]))
      for (const [localId, cloudId] of Object.entries(validated[entity])) {
        const existingCloudId = result[entity][localId]
        const existingLocalId = reverse.get(cloudId)
        if (existingCloudId && existingCloudId !== cloudId) {
          throw new Error(`Conflicting cloud IDs are stored for a local ${entity} ID.`)
        }
        if (existingLocalId && existingLocalId !== localId) {
          throw new Error(`One cloud ID is assigned to multiple local ${entity} IDs.`)
        }
        result[entity][localId] = cloudId
        reverse.set(cloudId, localId)
      }
    }
  }
  return result
}

function generateCloudUuid(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID()
  if (!cryptoApi?.getRandomValues) throw new Error('Secure UUID generation is unavailable in this browser.')

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function assignCloudId(
  currentMap: CloudIdMap,
  entity: CloudIdEntity,
  localId: string,
  uuidFactory: () => string = generateCloudUuid,
): { cloudId: string; idMap: CloudIdMap } {
  assertLocalId(localId)
  const idMap = normalizeCloudIdMap(currentMap)
  const bucket = entity === 'habit' ? idMap.habits : idMap.logs
  const existing = bucket[localId]
  if (existing) return { cloudId: existing, idMap }

  const cloudId = UUID_PATTERN.test(localId) ? localId.toLowerCase() : assertCloudUuid(uuidFactory())
  const usedBy = Object.entries(bucket).find(([, mappedId]) => mappedId === cloudId)?.[0]
  if (usedBy && usedBy !== localId) throw new Error(`The generated cloud ID is already assigned to another local ${entity}.`)

  bucket[localId] = cloudId
  return { cloudId, idMap }
}

export function registerCloudId(
  currentMap: CloudIdMap,
  entity: CloudIdEntity,
  localId: string,
  cloudId: string,
): CloudIdMap {
  return mergeCloudIdMaps(currentMap, {
    version: 1,
    habits: entity === 'habit' ? { [localId]: cloudId } : {},
    logs: entity === 'log' ? { [localId]: cloudId } : {},
  })
}

const LOG_STATUSES = new Set(['completed', 'partial', 'skipped', 'rest', 'freeze', 'missed'])
const TRACKING_TYPES = new Set(['checkbox', 'duration', 'count', 'numeric'])
const SCHEDULE_TYPES = new Set(['daily', 'weekdays', 'custom'])

function isRealDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  if (year < 1 || month < 1 || month > 12) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day >= 1 && day <= monthDays[month - 1]
}

function isValidTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!match || !isRealDate(match[1])) return false
  const hour = Number(match[2]), minute = Number(match[3]), second = Number(match[4])
  if (hour > 23 || minute > 59 || second > 59 || !Number.isFinite(Date.parse(value))) return false
  if (match[5] !== 'Z') {
    const offsetHour = Number(match[5].slice(1, 3)), offsetMinute = Number(match[5].slice(4, 6))
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return false
  }
  return true
}

export function isJsonCompatible(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object') return false
  if (seen.has(value)) return false
  if (!Array.isArray(value) && !isPlainRecord(value)) return false
  seen.add(value)
  const valid = Array.isArray(value)
    ? value.every(item => isJsonCompatible(item, seen))
    : Object.values(value).every(item => isJsonCompatible(item, seen))
  seen.delete(value)
  return valid
}

function addIssue(issues: SyncValidationIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message })
}

function validateHabitRecord(value: unknown, index: number, issues: SyncValidationIssue[]): value is Habit {
  const path = `habits[${index}]`
  if (!isPlainRecord(value)) {
    addIssue(issues, path, 'malformed-record', 'Habit must be a plain object.')
    return false
  }
  let valid = true
  const requireString = (key: string, nonempty = false) => {
    if (typeof value[key] !== 'string' || (nonempty && !(value[key] as string).trim())) {
      addIssue(issues, `${path}.${key}`, 'invalid-text', nonempty ? 'A non-empty text value is required.' : 'A text value is required.')
      valid = false
    }
  }
  requireString('id', true); requireString('name', true); requireString('category'); requireString('icon', true)
  requireString('color', true); requireString('description'); requireString('unit', true)
  if (typeof value.target !== 'number' || !Number.isFinite(value.target) || value.target <= 0) {
    addIssue(issues, `${path}.target`, 'invalid-number', 'Target must be a finite number greater than zero.')
    valid = false
  }
  if (typeof value.order !== 'number' || !Number.isFinite(value.order) || !Number.isInteger(value.order)) {
    addIssue(issues, `${path}.order`, 'invalid-number', 'Order must be a finite integer.')
    valid = false
  }
  if (typeof value.trackingType !== 'string' || !TRACKING_TYPES.has(value.trackingType)) {
    addIssue(issues, `${path}.trackingType`, 'invalid-value', 'Tracking type is not supported.')
    valid = false
  }
  if (typeof value.scheduleType !== 'string' || !SCHEDULE_TYPES.has(value.scheduleType)) {
    addIssue(issues, `${path}.scheduleType`, 'invalid-value', 'Schedule type is not supported.')
    valid = false
  }
  if (!Array.isArray(value.weekdays) || value.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)
    || new Set(value.weekdays).size !== value.weekdays.length) {
    addIssue(issues, `${path}.weekdays`, 'invalid-value', 'Weekdays must be unique integers from 0 through 6.')
    valid = false
  }
  if (typeof value.reminderTime !== 'string' || (value.reminderTime !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.reminderTime))) {
    addIssue(issues, `${path}.reminderTime`, 'invalid-value', 'Reminder time must be empty or a real HH:MM time.')
    valid = false
  }
  if (typeof value.paused !== 'boolean') {
    addIssue(issues, `${path}.paused`, 'invalid-value', 'Paused must be a boolean.')
    valid = false
  }
  if (!isValidTimestamp(value.createdAt)) {
    addIssue(issues, `${path}.createdAt`, 'invalid-timestamp', 'Created time must be a valid ISO timestamp with a timezone.')
    valid = false
  }
  return valid
}

function validateLogRecord(value: unknown, index: number, issues: SyncValidationIssue[]): value is HabitLog {
  const path = `logs[${index}]`
  if (!isPlainRecord(value)) {
    addIssue(issues, path, 'malformed-record', 'Habit log must be a plain object.')
    return false
  }
  let valid = true
  for (const key of ['id', 'habitId', 'note']) {
    if (typeof value[key] !== 'string' || (key !== 'note' && !(value[key] as string).trim())) {
      addIssue(issues, `${path}.${key}`, 'invalid-text', key === 'note' ? 'Note must be text.' : 'A non-empty ID is required.')
      valid = false
    }
  }
  if (!isRealDate(value.date)) {
    addIssue(issues, `${path}.date`, 'invalid-date', 'Date must be a real calendar date in YYYY-MM-DD format.')
    valid = false
  }
  if (typeof value.status !== 'string' || !LOG_STATUSES.has(value.status)) {
    addIssue(issues, `${path}.status`, 'invalid-status', 'Log status is not supported.')
    valid = false
  }
  if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
    addIssue(issues, `${path}.value`, 'invalid-number', 'Log value must be a finite number.')
    valid = false
  }
  if (!isValidTimestamp(value.updatedAt)) {
    addIssue(issues, `${path}.updatedAt`, 'invalid-timestamp', 'Updated time must be a valid ISO timestamp with a timezone.')
    valid = false
  }
  return valid
}

function validateRecords(habitsValue: unknown, logsValue: unknown): {
  habits: Habit[]
  logs: HabitLog[]
  issues: SyncValidationIssue[]
  duplicateLogGroups: DuplicateLogGroup[]
  duplicateRecordIds: DuplicateRecordId[]
} {
  const issues: SyncValidationIssue[] = []
  if (!Array.isArray(habitsValue)) addIssue(issues, 'habits', 'invalid-collection', 'Habits must be an array.')
  if (!Array.isArray(logsValue)) addIssue(issues, 'logs', 'invalid-collection', 'Habit logs must be an array.')
  const rawHabits = Array.isArray(habitsValue) ? habitsValue : []
  const rawLogs = Array.isArray(logsValue) ? logsValue : []
  const habits = rawHabits.filter((row, index): row is Habit => validateHabitRecord(row, index, issues))
  const logs = rawLogs.filter((row, index): row is HabitLog => validateLogRecord(row, index, issues))
  const duplicateLogGroups = findDuplicateLogGroups(rawLogs)
  const duplicateRecordIds = [
    ...findDuplicateRecordIds('habit', rawHabits),
    ...findDuplicateRecordIds('log', rawLogs),
  ]
  const habitIds = new Set(habits.map(habit => habit.id))
  logs.forEach((log, index) => {
    if (!habitIds.has(log.habitId)) addIssue(issues, `logs[${index}].habitId`, 'missing-habit', 'Log references a habit that is not present in this dataset.')
  })
  if (duplicateLogGroups.length) addIssue(issues, 'logs', 'duplicate-log-key', 'Multiple logs share the same habit and date; resolve the conflict before sync.')
  for (const duplicate of duplicateRecordIds) addIssue(issues, `${duplicate.entity === 'habit' ? 'habits' : 'logs'}.${duplicate.id}`, 'duplicate-id', `Local ${duplicate.entity} ID occurs ${duplicate.count} times.`)
  return { habits, logs, issues, duplicateLogGroups, duplicateRecordIds }
}

export function findDuplicateLogGroups(logs: readonly unknown[]): DuplicateLogGroup[] {
  const groups = new Map<string, HabitLog[]>()
  for (const value of logs) {
    if (!isPlainRecord(value) || typeof value.habitId !== 'string' || typeof value.date !== 'string') continue
    const log = value as unknown as HabitLog
    const key = JSON.stringify([log.habitId, log.date])
    const records = groups.get(key)
    if (records) records.push(log)
    else groups.set(key, [log])
  }
  return [...groups.values()]
    .filter(records => records.length > 1)
    .map(records => ({ habitId: records[0].habitId, date: records[0].date, records: [...records] }))
}

function findDuplicateRecordIds(entity: CloudIdEntity, values: readonly unknown[]): DuplicateRecordId[] {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (!isPlainRecord(value) || typeof value.id !== 'string') continue
    counts.set(value.id, (counts.get(value.id) ?? 0) + 1)
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([id, count]) => ({ entity, id, count }))
}

function localIdMetadata(localId: string): JsonObject {
  return { _habitOs: { schemaVersion: 1, localId } }
}

function habitDetails(habit: Habit): JsonObject {
  return {
    icon: habit.icon, color: habit.color, description: habit.description, target: habit.target,
    unit: habit.unit, trackingType: habit.trackingType, scheduleType: habit.scheduleType,
    weekdays: [...habit.weekdays], reminderTime: habit.reminderTime, paused: habit.paused,
    order: habit.order, createdAt: habit.createdAt, ...localIdMetadata(habit.id),
  }
}

function logDetails(log: HabitLog): JsonObject {
  return { value: log.value, note: log.note, ...localIdMetadata(log.id) }
}

function assertRecordValid(value: unknown, validator: (value: unknown, index: number, issues: SyncValidationIssue[]) => boolean, label: string): void {
  const issues: SyncValidationIssue[] = []
  if (!validator(value, 0, issues)) throw new Error(`${label} validation failed: ${issues.map(issue => `${issue.path}: ${issue.message}`).join(' ')}`)
}

export function mapHabitToCloudRow(habit: Habit, userId: string, cloudId: string, updatedAt: string): HabitCloudRow {
  assertRecordValid(habit, validateHabitRecord, 'Habit')
  if (!isValidTimestamp(updatedAt)) throw new Error('Habit updated_at must be a valid ISO timestamp with a timezone.')
  const details = habitDetails(habit)
  if (!isJsonCompatible(details)) throw new Error('Habit details are not JSON-compatible.')
  return {
    id: assertCloudUuid(cloudId), user_id: normalizeOwnerId(userId), name: habit.name,
    category: habit.category === '' ? null : habit.category, details, updated_at: updatedAt,
  }
}

export function mapHabitLogToCloudRow(log: HabitLog, userId: string, cloudId: string, cloudHabitId: string): HabitLogCloudRow {
  assertRecordValid(log, validateLogRecord, 'Habit log')
  const details = logDetails(log)
  if (!isJsonCompatible(details)) throw new Error('Habit log details are not JSON-compatible.')
  return {
    id: assertCloudUuid(cloudId), user_id: normalizeOwnerId(userId), habit_id: assertCloudUuid(cloudHabitId),
    log_date: log.date, status: log.status, details, updated_at: log.updatedAt,
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (isPlainRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function fingerprintString(input: string): string {
  let a = 0x811c9dc5, b = 0x9e3779b9
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    a = Math.imul(a ^ code, 0x01000193)
    b = Math.imul(b ^ code, 0x85ebca6b)
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`
}

/** Non-cryptographic content fingerprint for accidental stale-proof detection only. */
function fingerprintDataset(habits: readonly Habit[], logs: readonly HabitLog[]): string {
  const snapshot = {
    habits: habits.map(h => ({
      id: h.id, name: h.name, category: h.category, icon: h.icon, color: h.color, description: h.description,
      target: h.target, unit: h.unit, trackingType: h.trackingType, scheduleType: h.scheduleType,
      weekdays: h.weekdays, reminderTime: h.reminderTime, paused: h.paused, order: h.order, createdAt: h.createdAt,
    })),
    logs: logs.map(l => ({ id: l.id, habitId: l.habitId, date: l.date, status: l.status, value: l.value, note: l.note, updatedAt: l.updatedAt })),
  }
  const input = stableStringify(snapshot)
  return fingerprintString(input)
}

export function fingerprintDemoProvenance(provenance: DemoProvenanceSnapshot): string {
  return fingerprintString(stableStringify({
    version: provenance.version,
    generation: provenance.generation,
    markerStatus: provenance.markerStatus,
    lastObservedMarkerStatus: provenance.lastObservedMarkerStatus,
    knownDemoHabitIds: [...provenance.knownDemoHabitIds].sort(),
    knownDemoLogIds: [...provenance.knownDemoLogIds].sort(),
    unresolvedDemoHabitIds: [...provenance.unresolvedDemoHabitIds].sort(),
    unresolvedDemoLogIds: [...provenance.unresolvedDemoLogIds].sort(),
    demoGenerationTracked: provenance.demoGenerationTracked,
  }))
}

function intersects(currentIds: readonly string[], knownIds: readonly string[]): boolean {
  const known = new Set(knownIds)
  return currentIds.some(id => known.has(id))
}

export function validateLocalSyncRecords(stateValue: unknown): {
  state?: Record<string, unknown>
  habits: Habit[]
  logs: HabitLog[]
  issues: SyncValidationIssue[]
  duplicateLogGroups: DuplicateLogGroup[]
  duplicateRecordIds: DuplicateRecordId[]
} {
  if (!isPlainRecord(stateValue)) {
    return {
      habits: [], logs: [], issues: [{ path: 'state', code: 'malformed-state', message: 'App state must be a plain object.' }],
      duplicateLogGroups: [], duplicateRecordIds: [],
    }
  }
  const checked = validateRecords(stateValue.habits, stateValue.logs)
  return { state: stateValue, ...checked }
}

function validateProvenanceSnapshot(value: unknown): value is DemoProvenanceSnapshot {
  if (!isPlainRecord(value) || value.version !== 1 || value.valid !== true
    || !Number.isSafeInteger(value.generation) || (value.generation as number) < 0
    || !['demo-present', 'non-demo-unconfirmed', 'unknown'].includes(String(value.markerStatus))
    || !['demo-present', 'non-demo-unconfirmed', 'unknown'].includes(String(value.lastObservedMarkerStatus))
    || value.markerStatus !== value.lastObservedMarkerStatus
    || typeof value.demoGenerationTracked !== 'boolean') return false
  for (const key of ['knownDemoHabitIds', 'knownDemoLogIds', 'unresolvedDemoHabitIds', 'unresolvedDemoLogIds']) {
    if (!Array.isArray(value[key]) || !(value[key] as unknown[]).every(id => typeof id === 'string' && id.trim())
      || new Set(value[key] as string[]).size !== (value[key] as string[]).length) return false
  }
  if ((value.knownDemoHabitIds as string[]).some(id => (value.unresolvedDemoHabitIds as string[]).includes(id))
    || (value.knownDemoLogIds as string[]).some(id => (value.unresolvedDemoLogIds as string[]).includes(id))) return false
  return true
}

function reviewedIdsMatch(proof: NonDemoReviewProof, habits: readonly Habit[], logs: readonly HabitLog[]): boolean {
  return proof.reviewedHabitIds.length === habits.length && proof.reviewedLogIds.length === logs.length
    && habits.every(h => proof.reviewedHabitIds.includes(h.id))
    && logs.every(l => proof.reviewedLogIds.includes(l.id))
}

/** Creates a review proof from an already-loaded, validated storage snapshot. */
export function createNonDemoReviewProof(
  state: unknown,
  ownerId: string,
  ownerLock: unknown,
  provenanceValue: unknown,
  explicitlyReviewedEveryRecord: boolean,
): NonDemoReviewProof {
  if (!explicitlyReviewedEveryRecord) throw new Error('Review every habit and log before confirming this dataset as non-demo.')
  if (!validateProvenanceSnapshot(provenanceValue)) throw new Error('Persisted demo provenance is missing, malformed, or unavailable.')
  const provenance = provenanceValue
  if (!isPlainRecord(state) || state.demo === true || (state.demo !== undefined && typeof state.demo !== 'boolean')) {
    throw new Error('Known demo or malformed marker data cannot be approved for sync.')
  }
  if (inspectDemoMarker(state.demo) !== provenance.lastObservedMarkerStatus) {
    throw new Error('The current demo marker does not match persisted provenance; review after provenance is recorded.')
  }
  const lock = normalizeSyncOwnerLock(ownerLock)
  const normalizedOwnerId = normalizeOwnerId(ownerId)
  if (lock.ownerId !== normalizedOwnerId) throw new Error('The local dataset owner lock does not match the authenticated owner.')
  if (!Array.isArray(state.habits) || !Array.isArray(state.logs)) throw new Error('Habits and logs must be arrays before review.')
  const checked = validateRecords(state.habits, state.logs)
  if (checked.issues.length) throw new Error(`Dataset review is blocked: ${checked.issues.map(issue => issue.message).join(' ')}`)
  if (intersects(checked.habits.map(h => h.id), provenance.knownDemoHabitIds)
    || intersects(checked.logs.map(l => l.id), provenance.knownDemoLogIds)) {
    throw new Error('Known demo-origin records must be removed locally before this dataset can be approved.')
  }
  return {
    version: 1,
    ownerId: normalizedOwnerId,
    demoProvenance: 'confirmed-non-demo',
    reviewedHabitIds: checked.habits.map(h => h.id),
    reviewedLogIds: checked.logs.map(l => l.id),
    datasetFingerprint: fingerprintDataset(checked.habits, checked.logs),
    rawDemoMarkerStatus: inspectDemoMarker(state.demo),
    provenanceGeneration: provenance.generation,
    provenanceFingerprint: fingerprintDemoProvenance(provenance),
  }
}

export function isCurrentNonDemoReviewProof(
  state: unknown,
  ownerId: string,
  ownerLockValue: unknown,
  provenanceValue: unknown,
  proofValue: unknown,
): proofValue is NonDemoReviewProof {
  try {
    if (!isPlainRecord(state) || state.demo === true || (state.demo !== undefined && typeof state.demo !== 'boolean')) return false
    if (!validateProvenanceSnapshot(provenanceValue) || !isPlainRecord(proofValue)) return false
    const provenance = provenanceValue
    const proof = proofValue as unknown as NonDemoReviewProof
    const normalizedOwnerId = normalizeOwnerId(ownerId)
    const ownerLock = normalizeSyncOwnerLock(ownerLockValue)
    if (ownerLock.ownerId !== normalizedOwnerId
      || inspectDemoMarker(state.demo) !== provenance.lastObservedMarkerStatus
      || proof.version !== 1 || proof.demoProvenance !== 'confirmed-non-demo' || proof.ownerId !== normalizedOwnerId
      || proof.rawDemoMarkerStatus !== inspectDemoMarker(state.demo)
      || proof.provenanceGeneration !== provenance.generation
      || proof.provenanceFingerprint !== fingerprintDemoProvenance(provenance)) return false
    if (!Array.isArray(state.habits) || !Array.isArray(state.logs)) return false
    const checked = validateRecords(state.habits, state.logs)
    if (checked.issues.length || !reviewedIdsMatch(proof, checked.habits, checked.logs)
      || proof.datasetFingerprint !== fingerprintDataset(checked.habits, checked.logs)) return false
    if (intersects(checked.habits.map(h => h.id), provenance.knownDemoHabitIds)
      || intersects(checked.logs.map(l => l.id), provenance.knownDemoLogIds)) return false
    return true
  } catch { return false }
}

export function blockedPayloadResult(
  reason: Extract<InitialPayloadResult, { ok: false }>['reason'],
  errors: SyncValidationIssue[] = [],
  duplicateLogGroups: DuplicateLogGroup[] = [],
  duplicateRecordIds: DuplicateRecordId[] = [],
  idMap = createEmptyCloudIdMap(),
): InitialPayloadResult {
  return { ok: false, reason, errors, duplicateLogGroups, duplicateRecordIds, idMap }
}

