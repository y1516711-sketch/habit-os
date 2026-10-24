import type { AppState } from './types'
// Persistent storage: IndexedDB (survives restarts, large quota, free, on-device).
// Falls back to localStorage if IndexedDB is unavailable (private mode etc.).
const DB = 'habit-os-db', STORE = 'kv', KEY = 'state-v1', LS_KEY = 'habit-os-state-v1'

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
export function validateImported(data: unknown): { ok: boolean; error?: string; state?: AppState } {
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
  return { ok: true, state: data as AppState }
}
