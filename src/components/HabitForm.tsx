import { useState } from 'react'
import { uid, WEEKDAY_LABELS } from '../lib/date'
import { useOS } from '../lib/store'
import type { Habit } from '../lib/types'
import { Modal } from './ui'

const ICONS = ['💻', '🛡️', '🎥', '🏋️', '🏃', '📚', '🧘', '💧', '🎸', '✍️', '🧠', '💪', '🌅', '📖', '🎯', '✅']
const COLORS = ['#22ff88', '#22d3ee', '#a78bfa', '#f472b6', '#facc15', '#fb923c', '#f87171', '#34d399']

export function blankHabit(categories: string[]): Habit {
  return {
    id: uid(), name: '', category: categories[0] || 'General', icon: '✅', color: COLORS[0],
    description: '', target: 30, unit: 'minutes', trackingType: 'duration',
    scheduleType: 'daily', weekdays: [1, 2, 3, 4, 5], reminderTime: '',
    paused: false, order: 999, createdAt: new Date().toISOString(),
  }
}
export default function HabitForm({ initial, onClose }: { initial: Habit; onClose: () => void }) {
  const { state, saveHabit, setToast } = useOS()
  const [h, setH] = useState<Habit>({ ...initial })
  const [err, setErr] = useState('')
  const set = (p: Partial<Habit>) => setH(x => ({ ...x, ...p }))
  const toggleDay = (d: number) => set({ weekdays: h.weekdays.includes(d) ? h.weekdays.filter(x => x !== d) : [...h.weekdays, d] })
  const submit = () => {
    if (!h.name.trim()) return setErr('Habit name is required.')
    if (!(h.target > 0)) return setErr('Daily target must be greater than 0.')
    if (h.scheduleType !== 'daily' && h.weekdays.length === 0) return setErr('Pick at least one weekday, or choose Daily.')
    saveHabit({ ...h, name: h.name.trim() })
    setToast(state.habits.some(x => x.id === h.id) ? `Updated "${h.name.trim()}"` : `Created "${h.name.trim()}" 🎉`)
    onClose()
  }
  return (
    <Modal title={state.habits.some(x => x.id === h.id) ? 'Edit habit' : 'New habit'} onClose={onClose}>
      {err && <div className="card" style={{ borderColor: 'var(--danger)', padding: 10, marginBottom: 8 }} role="alert">⚠️ {err}</div>}
      <label>Name *</label>
      <input value={h.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. Coding" autoFocus />
      <label>Description</label>
      <input value={h.description} onChange={e => set({ description: e.target.value })} placeholder="Optional details" />
      <div className="grid g2">
        <div><label>Category</label>
          <select value={h.category} onChange={e => set({ category: e.target.value })}>
            {state.categories.map(c => <option key={c}>{c}</option>)}
          </select></div>
        <div><label>Tracking type</label>
          <select value={h.trackingType} onChange={e => set({ trackingType: e.target.value as Habit['trackingType'] })}>
            <option value="checkbox">Checkbox (done / not done)</option>
            <option value="duration">Duration (minutes)</option>
            <option value="count">Count (times)</option>
            <option value="numeric">Numeric value</option>
          </select></div>
        <div><label>Daily target *</label>
          <input type="number" min={1} value={h.target} onChange={e => set({ target: Number(e.target.value) })} /></div>
        <div><label>Target unit</label>
          <select value={h.unit} onChange={e => set({ unit: e.target.value })}>
            {['minutes', 'times', 'pages', 'km', 'glasses', 'reps', 'sessions'].map(u => <option key={u}>{u}</option>)}
          </select></div>
        <div><label>Schedule</label>
          <select value={h.scheduleType} onChange={e => set({ scheduleType: e.target.value as Habit['scheduleType'] })}>
            <option value="daily">Every day</option>
            <option value="weekdays">Selected weekdays</option>
            <option value="custom">Custom days</option>
          </select></div>
        <div><label>Reminder time (optional)</label>
          <input type="time" value={h.reminderTime} onChange={e => set({ reminderTime: e.target.value })} /></div>
      </div>
      {h.scheduleType !== 'daily' && (
        <><label>Days</label><div className="row">
          {WEEKDAY_LABELS.map((lbl, d) => (
            <button key={d} type="button" className="btn small" aria-pressed={h.weekdays.includes(d)}
              style={h.weekdays.includes(d) ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
              onClick={() => toggleDay(d)}>{lbl}</button>))}
        </div></>
      )}
      <label>Icon</label>
      <div className="row">{ICONS.map(i => (
        <button key={i} type="button" className="btn small" aria-pressed={h.icon === i}
          style={{ fontSize: 18, ...(h.icon === i ? { borderColor: 'var(--accent)' } : {}) }} onClick={() => set({ icon: i })}>{i}</button>))}
      </div>
      <label>Color</label>
      <div className="row">{COLORS.map(c => (
        <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={h.color === c}
          style={{ width: 30, height: 30, borderRadius: 9, background: c, border: h.color === c ? '3px solid #fff' : '1px solid var(--border)' }}
          onClick={() => set({ color: c })} />))}
      </div>
      <label className="row" style={{ marginTop: 14, cursor: 'pointer' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={h.paused} onChange={e => set({ paused: e.target.checked })} /> Paused (hidden from schedule & streaks)
      </label>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={submit}>Save habit</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}
