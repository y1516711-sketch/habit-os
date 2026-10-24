import { useState } from 'react'
import { fmtMinutes, todayKey } from '../lib/date'
import { focusMinutesOn, habitStreak, logFor } from '../lib/analytics'
import { useOS } from '../lib/store'
import type { Habit, LogStatus } from '../lib/types'

const STATUSES: { id: Exclude<LogStatus, 'none' | 'missed'>; label: string }[] = [
  { id: 'completed', label: '✅ Done' }, { id: 'partial', label: '🟡 Partial' },
  { id: 'skipped', label: '⏭️ Skip' }, { id: 'rest', label: '💤 Rest' },
]
export default function HabitDayRow({ habit, date, onStartTimer }: { habit: Habit; date: string; onStartTimer?: (h: Habit) => void }) {
  const { state, upsertLog, removeLog } = useOS()
  const log = logFor(state, habit.id, date)
  const focus = focusMinutesOn(state, date, habit.id)
  const streak = habitStreak(state, habit)
  const [showNote, setShowNote] = useState(false)
  const [note, setNote] = useState(log?.note || '')
  const [val, setVal] = useState<number>(log?.value || 0)
  const isFuture = date > todayKey()

  const click = (s: typeof STATUSES[number]['id']) => {
    if (isFuture) return
    if (log?.status === s) { removeLog(habit.id, date); return } // toggle off = clear (still one record max)
    const value = s === 'completed' ? habit.target : s === 'partial' ? (val > 0 ? val : Math.round(habit.target / 2)) : val
    upsertLog(habit.id, date, s, value, note)
  }
  return (
    <div className="habit-row">
      <div className="ic" style={{ borderColor: habit.color }} aria-hidden>{habit.icon}</div>
      <div style={{ flex: '1 1 180px', minWidth: 150 }}>
        <div style={{ fontWeight: 800 }}>{habit.name} {streak.current > 1 && <span className="chip" title="Current streak">🔥 {streak.current}</span>}</div>
        <div className="muted small">
          Target {habit.target} {habit.unit} · {habit.category}
          {focus > 0 && <> · ⏱️ {fmtMinutes(focus)} focused</>}
          {habit.reminderTime && <> · 🔔 {habit.reminderTime}</>}
        </div>
        {log?.note && !showNote && <div className="small muted">📝 {log.note}</div>}
        {showNote && (
          <div className="row" style={{ marginTop: 8 }}>
            {(habit.trackingType === 'count' || habit.trackingType === 'numeric' || habit.trackingType === 'duration') && (
              <input type="number" min={0} style={{ width: 110 }} value={val || ''} placeholder={`Value (${habit.unit})`}
                onChange={e => setVal(Number(e.target.value))} aria-label="Logged value" />)}
            <input style={{ flex: 1, minWidth: 140 }} value={note} placeholder="Add a note for this log…" onChange={e => setNote(e.target.value)} aria-label="Log note" />
            <button className="btn small primary" onClick={() => { if (log) upsertLog(habit.id, date, log.status, val || log.value, note); setShowNote(false) }}>Save</button>
          </div>
        )}
      </div>
      <div className="status-btns" role="group" aria-label={`Status for ${habit.name}`}>
        {STATUSES.map(s => (
          <button key={s.id} data-s={s.id} className={log?.status === s.id ? 'on' : ''} disabled={isFuture} onClick={() => click(s.id)}>{s.label}</button>
        ))}
      </div>
      <div className="row">
        <button className="btn small" onClick={() => { setNote(log?.note || ''); setVal(log?.value || 0); setShowNote(v => !v) }}>📝</button>
        {onStartTimer && <button className="btn small" onClick={() => onStartTimer(habit)}>▶ Timer</button>}
      </div>
      {isFuture && <div className="muted small">Future day — logging unlocks when the day arrives.</div>}
    </div>
  )
}
