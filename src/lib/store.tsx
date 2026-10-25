import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { clearState, loadDemoProvenanceMetadata, loadState, recordDemoProvenance, saveState, type DemoProvenanceMetadata } from './db'
import { inspectDemoMarker } from './cloudSync'
import { defaultState } from './defaults'
import { addDays, todayKey, uid } from './date'
import { isScheduled } from './analytics'
import type { AppState, Habit, HabitLog, LogStatus } from './types'

interface Ctx {
  state: AppState; ready: boolean; toast: string
  update: (fn: (s: AppState) => AppState) => void
  setToast: (t: string) => void
  upsertLog: (habitId: string, date: string, status: Exclude<LogStatus, 'none'>, value?: number, note?: string) => void
  removeLog: (habitId: string, date: string) => void
  saveHabit: (h: Habit) => void; deleteHabit: (id: string) => void
  resetAll: () => Promise<void>; loadDemo: () => Promise<void>; replaceState: (s: AppState, rawDemoMarker?: unknown) => Promise<void>
  demoProvenance: DemoProvenanceMetadata
}
const C = createContext<Ctx | null>(null)
export const useOS = () => { const v = useContext(C); if (!v) throw new Error('useOS outside provider'); return v }

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(() => defaultState())
  const [ready, setReady] = useState(false)
  const [toast, setToastRaw] = useState('')
  const [demoProvenance, setDemoProvenance] = useState<DemoProvenanceMetadata>({
    version: 1, generation: 0, markerStatus: 'unknown', lastObservedMarkerStatus: 'unknown', knownDemoHabitIds: [], knownDemoLogIds: [],
    unresolvedDemoHabitIds: [], unresolvedDemoLogIds: [], demoGenerationTracked: false, valid: false,
  })
  const toastT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const setToast = useCallback((t: string) => {
    setToastRaw(t); clearTimeout(toastT.current)
    if (t) toastT.current = setTimeout(() => setToastRaw(''), 3400)
  }, [])

  useEffect(() => {
    let alive = true
    const fallbackProvenance: DemoProvenanceMetadata = {
      version: 1, generation: 0, markerStatus: 'unknown', lastObservedMarkerStatus: 'unknown', knownDemoHabitIds: [], knownDemoLogIds: [],
      unresolvedDemoHabitIds: [], unresolvedDemoLogIds: [], demoGenerationTracked: false, valid: false,
    }
    Promise.all([loadState(), loadDemoProvenanceMetadata().catch(() => fallbackProvenance)]).then(([s, storedProvenance]) => {
      if (!alive) return
      const currentMarkerStatus = inspectDemoMarker(s?.demo)
      const markerStatus = currentMarkerStatus
      const allHabitIds = s?.demo === true && Array.isArray(s.habits) ? s.habits.flatMap(h => h && typeof h.id === 'string' ? [h.id] : []) : []
      const allLogIds = s?.demo === true && Array.isArray(s.logs) ? s.logs.flatMap(l => l && typeof l.id === 'string' ? [l.id] : []) : []
      const unresolvedHabitIds = storedProvenance.demoGenerationTracked ? [] : allHabitIds.filter(id => !storedProvenance.knownDemoHabitIds.includes(id))
      const unresolvedLogIds = storedProvenance.demoGenerationTracked ? [] : allLogIds.filter(id => !storedProvenance.knownDemoLogIds.includes(id))
      setDemoProvenance({
        ...storedProvenance,
        markerStatus,
        lastObservedMarkerStatus: markerStatus,
        unresolvedDemoHabitIds: [...new Set([...storedProvenance.unresolvedDemoHabitIds, ...unresolvedHabitIds])],
        unresolvedDemoLogIds: [...new Set([...storedProvenance.unresolvedDemoLogIds, ...unresolvedLogIds])],
        valid: false,
      })
      if (s && Array.isArray(s.habits)) {
        // merge with defaults so older/partial saves never crash the app
        const d = defaultState()
        setState({ ...d, ...s, demo: typeof s.demo === 'boolean' ? s.demo : undefined, settings: { ...d.settings, ...(s.settings || {}) }, timer: { ...d.timer, ...(s.timer || {}) }, gamification: { ...d.gamification, ...((s as AppState).gamification || {}) },
          profile: { ...d.profile, ...((s as AppState).profile || {}), onboarded: ((s as AppState).profile?.onboarded ?? (((s.logs?.length || 0) > 0 || (s.sessions?.length || 0) > 0 || !!s.settings?.userName))) },
          moods: (s as AppState).moods || [] })
      } else setState(current => ({ ...current, demo: undefined }))
      setReady(true)
      void recordDemoProvenance(markerStatus, [], [], unresolvedHabitIds, unresolvedLogIds)
        .then(value => { if (alive) setDemoProvenance(value) })
        .catch(() => { if (alive) setDemoProvenance(current => ({ ...current, valid: false })) })
    })
    return () => { alive = false }
  }, [])
  useEffect(() => { if (ready) saveState(state) }, [state, ready])

  const update = useCallback((fn: (s: AppState) => AppState) => setState(prev => fn(prev)), [])
  const upsertLog = useCallback<Ctx['upsertLog']>((habitId, date, status, value = 0, note) => {
    setState(prev => {
      const existing = prev.logs.find(l => l.habitId === habitId && l.date === date)
      const log: HabitLog = existing
        ? { ...existing, status, value, note: note ?? existing.note, updatedAt: new Date().toISOString() }
        : { id: uid(), habitId, date, status, value, note: note ?? '', updatedAt: new Date().toISOString() }
      // Unique constraint: exactly ONE log per habit+date.
      return { ...prev, logs: [...prev.logs.filter(l => !(l.habitId === habitId && l.date === date)), log] }
    })
  }, [])
  const removeLog = useCallback((habitId: string, date: string) =>
    setState(p => ({ ...p, logs: p.logs.filter(l => !(l.habitId === habitId && l.date === date)) })), [])
  const saveHabit = useCallback((h: Habit) => setState(p => {
    const exists = p.habits.some(x => x.id === h.id)
    return { ...p, habits: exists ? p.habits.map(x => x.id === h.id ? h : x) : [...p.habits, { ...h, order: p.habits.length }] }
  }), [])
  const deleteHabit = useCallback((id: string) => setState(p => ({
    ...p, habits: p.habits.filter(h => h.id !== id),
    logs: p.logs.filter(l => l.habitId !== id), sessions: p.sessions.filter(s => s.habitId !== id),
  })), [])
  const resetAll = useCallback(async () => {
    await clearState()
    const fresh = defaultState()
    setState(fresh)
    const markerStatus = inspectDemoMarker(fresh.demo)
    setDemoProvenance(prev => ({ ...prev, markerStatus, lastObservedMarkerStatus: markerStatus, valid: false }))
    void recordDemoProvenance(markerStatus, [], [], [], [], false, true).then(setDemoProvenance).catch(() => setDemoProvenance(prev => ({ ...prev, valid: false })))
  }, [])
  const replaceState = useCallback(async (s: AppState, rawDemoMarker: unknown = s.demo) => {
    const d = defaultState()
    const markerStatus = inspectDemoMarker(rawDemoMarker)
    const unresolvedHabitIds = rawDemoMarker === true && Array.isArray(s.habits) ? s.habits.flatMap(h => h && typeof h.id === 'string' ? [h.id] : []) : []
    const unresolvedLogIds = rawDemoMarker === true && Array.isArray(s.logs) ? s.logs.flatMap(l => l && typeof l.id === 'string' ? [l.id] : []) : []
    const provenance = await recordDemoProvenance(markerStatus, [], [], unresolvedHabitIds, unresolvedLogIds, false, true)
    setDemoProvenance(provenance)
    setState({ ...d, ...s, demo: typeof rawDemoMarker === 'boolean' ? rawDemoMarker : undefined, settings: { ...d.settings, ...(s.settings || {}) }, timer: d.timer, gamification: { ...d.gamification, ...(s.gamification || {}) }, profile: { ...d.profile, ...(s.profile || {}), onboarded: s.profile?.onboarded ?? true }, moods: s.moods || [] })
  }, [])
  const loadDemo = useCallback(async () => {
    const prev = state
    const logs: HabitLog[] = []; const sessions = [...prev.sessions]
    // Deterministic-ish demo for the last 35 days (clearly labelled demo mode).
    let seed = 42; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    for (let i = 35; i >= 1; i--) {
      const date = addDays(todayKey(), -i)
      for (const h of prev.habits) {
        if (!isScheduled(h, date)) continue
        const r = rnd()
        const status = r < 0.68 ? 'completed' : r < 0.8 ? 'partial' : r < 0.9 ? 'skipped' : 'rest'
        logs.push({ id: uid(), habitId: h.id, date, status: status as HabitLog['status'], value: status === 'completed' ? h.target : Math.round(h.target / 2), note: '', updatedAt: new Date().toISOString() })
        if (status === 'completed' && rnd() < 0.6) {
          const start = new Date(`${date}T09:00:00`); const dur = Math.round(h.target * 60 * (0.8 + rnd() * 0.4))
          sessions.push({ id: uid(), habitId: h.id, start: start.toISOString(), end: new Date(start.getTime() + dur * 1000).toISOString(), durationSec: dur, mode: 'pomodoro', note: 'demo' })
        }
      }
    }
    const logKeys = new Set(logs.map(l => `${l.habitId}|${l.date}`))
    setDemoProvenance(current => ({
      ...current,
      markerStatus: 'demo-present',
      lastObservedMarkerStatus: 'demo-present',
      knownDemoLogIds: [...new Set([...current.knownDemoLogIds, ...logs.map(log => log.id)])],
      valid: false,
    }))
    try {
      const provenance = await recordDemoProvenance('demo-present', [], logs.map(log => log.id), [], [], true, true)
      setDemoProvenance(provenance)
    } catch {
      setDemoProvenance(current => ({ ...current, valid: false }))
    }
    setState({ ...prev, demo: true, logs: [...prev.logs.filter(l => !logKeys.has(`${l.habitId}|${l.date}`)), ...logs], sessions })
  }, [state])

  const value = useMemo<Ctx>(() => ({ state, ready, toast, update, setToast, upsertLog, removeLog, saveHabit, deleteHabit, resetAll, loadDemo, replaceState, demoProvenance }),
    [state, ready, toast, update, setToast, upsertLog, removeLog, saveHabit, deleteHabit, resetAll, loadDemo, replaceState, demoProvenance])
  return <C.Provider value={value}>{children}</C.Provider>
}
