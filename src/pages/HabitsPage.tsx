import { useState } from 'react'
import HabitForm, { blankHabit } from '../components/HabitForm'
import { Empty, Modal } from '../components/ui'
import { habitStreak } from '../lib/analytics'
import { WEEKDAY_LABELS } from '../lib/date'
import { useOS } from '../lib/store'
import type { Habit } from '../lib/types'

export default function HabitsPage() {
  const { state, update, deleteHabit, setToast } = useOS()
  const [editing, setEditing] = useState<Habit | null>(null)
  const [confirmDel, setConfirmDel] = useState<Habit | null>(null)
  const [q, setQ] = useState('')
  const sorted = [...state.habits].sort((a, b) => a.order - b.order)
    .filter(h => h.name.toLowerCase().includes(q.toLowerCase()) || h.category.toLowerCase().includes(q.toLowerCase()))
  const move = (h: Habit, dir: -1 | 1) => update(s => {
    const arr = [...s.habits].sort((a, b) => a.order - b.order)
    const i = arr.findIndex(x => x.id === h.id); const j = i + dir
    if (j < 0 || j >= arr.length) return s
    const a = arr[i].order; arr[i] = { ...arr[i], order: arr[j].order }; arr[j] = { ...arr[j], order: a }
    const byId = new Map(arr.map(x => [x.id, x.order]))
    return { ...s, habits: s.habits.map(x => ({ ...x, order: byId.get(x.id) ?? x.order })) }
  })
  return (
    <div className="grid" style={{ gap: 18 }}>
      <header className="row spread">
        <div><h1>🗂️ Habits Management</h1><div className="muted">Create, edit, pause, reorder or delete. Sample habits are fully editable.</div></div>
        <button className="btn primary" onClick={() => setEditing(blankHabit(state.categories))}>＋ New habit</button>
      </header>
      <input placeholder="🔍 Search habits or categories…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search habits" />
      <section className="grid" style={{ gap: 10 }}>
        {sorted.length === 0 && <Empty title="No habits found">Create your first habit with the button above.</Empty>}
        {sorted.map(h => {
          const streak = habitStreak(state, h)
          return (
            <div key={h.id} className="habit-row" style={h.paused ? { opacity: 0.55 } : undefined}>
              <div className="ic" style={{ borderColor: h.color }}>{h.icon}</div>
              <div style={{ flex: '1 1 210px' }}>
                <b>{h.name}</b> <span className="chip">{h.category}</span> {h.paused && <span className="chip">⏸ Paused</span>}
                <div className="muted small">
                  {h.description || 'No description'} · Target {h.target} {h.unit} ({h.trackingType}) ·{' '}
                  {h.scheduleType === 'daily' ? 'Every day' : h.weekdays.map(d => WEEKDAY_LABELS[d]).join(', ')}
                  {h.reminderTime && ` · 🔔 ${h.reminderTime}`} · 🔥 streak {streak.current} (best {streak.longest})
                </div>
              </div>
              <div className="row">
                <button className="btn small" onClick={() => move(h, -1)} aria-label={`Move ${h.name} up`}>↑</button>
                <button className="btn small" onClick={() => move(h, 1)} aria-label={`Move ${h.name} down`}>↓</button>
                <button className="btn small" onClick={() => { update(s => ({ ...s, habits: s.habits.map(x => x.id === h.id ? { ...x, paused: !x.paused } : x) })); setToast(h.paused ? `Resumed "${h.name}"` : `Paused "${h.name}"`) }}>{h.paused ? 'Resume' : 'Pause'}</button>
                <button className="btn small" onClick={() => setEditing(h)}>✏️ Edit</button>
                <button className="btn small danger" onClick={() => setConfirmDel(h)}>Delete</button>
              </div>
            </div>
          )
        })}
      </section>
      {editing && <HabitForm initial={editing} onClose={() => setEditing(null)} />}
      {confirmDel && (
        <Modal title="Delete habit?" onClose={() => setConfirmDel(null)}>
          <p>Delete <b>{confirmDel.icon} {confirmDel.name}</b> and all its logs &amp; sessions? This cannot be undone (export a backup first if unsure).</p>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn danger" onClick={() => { deleteHabit(confirmDel.id); setConfirmDel(null); setToast('Habit deleted.') }}>Yes, delete</button>
            <button className="btn" onClick={() => setConfirmDel(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
