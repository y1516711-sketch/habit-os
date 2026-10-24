// All dates are LOCAL YYYY-MM-DD keys. We never use toISOString() for day keys
// (that is UTC and shifts days for users ahead of/behind UTC, e.g. India +05:30).
export const pad = (n: number) => String(n).padStart(2, '0')
export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function todayKey(): string { return toKey(new Date()) }
export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0) // noon avoids DST edges
}
export function addDays(key: string, n: number): string {
  const d = parseKey(key); d.setDate(d.getDate() + n); return toKey(d)
}
export function pretty(key: string): string {
  return parseKey(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}
export function prettyLong(key: string): string {
  return parseKey(key).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
export function weekKeys(anchorKey: string, weekStart: 'Monday' | 'Sunday' = 'Monday'): string[] {
  const d = parseKey(anchorKey)
  const dow = d.getDay() // 0 Sun
  const offset = weekStart === 'Monday' ? (dow + 6) % 7 : dow
  const start = addDays(anchorKey, -offset)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}
export function monthKeys(year: number, month0: number): string[] {
  const days = new Date(year, month0 + 1, 0).getDate()
  return Array.from({ length: days }, (_, i) => `${year}-${pad(month0 + 1)}-${pad(i + 1)}`)
}
export function rangesOverlapDay(isoStart: string): string { return toKey(new Date(isoStart)) }
export function fmtMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)}m`
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return m ? `${h}h ${m}m` : `${h}h`
}
export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}
export const uid = (): string =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
