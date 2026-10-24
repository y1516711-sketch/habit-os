import { useState } from 'react'
import GamificationPanel from '../components/GamificationPanel'
import { Empty, Modal } from '../components/ui'
import { achievements, focusMinutesBetween, habitStreak, xpAndLevel } from '../lib/analytics'
import { fmtMinutes, monthKeys, todayKey, uid, weekKeys } from '../lib/date'
import { useOS } from '../lib/store'
import type { Goal } from '../lib/types'

export default function GoalsPage() {
  const { state, update, setToast } = useOS()
  const [showForm, setShowForm] = useState(false)
  const [f, setF] = useState({ title: '', period: 'weekly' as Goal['period'], habitId: '', target: 300, metric: 'focusMinutes' as Goal['metric'] })
  const xp = xpAndLevel(state)
  const badges = achievements(state)
  const now = new Date()

  const progress = (g: Goal): number => {
    const keys = g.period === 'daily' ? [todayKey()] : g.period === 'weekly' ? weekKeys(todayKey(), state.settings.weekStart) : monthKeys(now.getFullYear(), now.getMonth())
    if (g.metric === 'focusMinutes') return Math.round(focusMinutesBetween(state, keys, g.habitId || undefined))
    return state.logs.filter(l => keys.includes(l.date) && l.status === 'completed' && (!g.habitId || l.habitId === g.habitId)).length
  }
  const add = () => {
    if (!f.title.trim()) return setToast('Give the goal a title.')
    if (!(f.target > 0)) return setToast('Target must be above 0.')
    const g: Goal = { id: uid(), title: f.title.trim(), period: f.period, habitId: f.habitId, target: f.target, unit: f.metric === 'focusMinutes' ? 'minutes' : 'completions', metric: f.metric, createdAt: new Date().toISOString() }
    update(s => ({ ...s, goals: [...s.goals, g] })); setShowForm(false); setToast('Goal created 🎯')
  }
  return (
    <div className="grid" style={{ gap: 18 }}>
      <header className="row spread">
        <div><h1>🎯 Goals &amp; Achievements</h1><div className="muted">XP: {state.settings.xpPerCompletion} per completed habit (configurable) + 5 per 10 focus minutes.</div></div>
        <button className="btn primary" onClick={() => setShowForm(true)}>＋ New goal</button>
      </header>

      <section className="card">
        <div className="row spread"><div><div className="kicker">Your level</div><div style={{ fontSize: 30, fontWeight: 900 }}>🏆 Level {xp.level} · {xp.xp} XP</div></div>
          <span className="chip">{xp.toNext} XP to Level {xp.level + 1}</span></div>
        <div className="bar" style={{ marginTop: 12 }}><i style={{ width: `${xp.progress}%` }} /></div>
        <p className="muted small">{xp.completed} completed habits · {xp.partial} partial · {fmtMinutes(xp.focusMin)} total focus.</p>
      </section>

      <GamificationPanel />

      <section>
        <h2>Goals</h2>
        <div className="grid g2">
          {state.goals.length === 0 && <Empty title="No goals yet">Example: “300 focus minutes weekly” or “5 completions of Coding per week”.</Empty>}
          {state.goals.map(g => {
            const p = progress(g); const pct = Math.min(100, Math.round((p / g.target) * 100))
            const habitName = g.habitId ? state.habits.find(h => h.id === g.habitId)?.name : 'All habits'
            return (
              <div key={g.id} className="card">
                <div className="row spread"><b>{g.title}</b><span className="chip">{g.period}</span></div>
                <div className="muted small">{habitName} · current {g.period}</div>
                <div style={{ fontSize: 24, fontWeight: 900, margin: '6px 0' }}>{p} / {g.target} <span className="muted small">{g.unit}</span> {pct >= 100 && '🎉'}</div>
                <div className="bar"><i style={{ width: `${pct}%` }} /></div>
                <div className="row" style={{ marginTop: 10 }}><span className="muted small">{pct}%</span>
                  <button className="btn small danger" onClick={() => update(s => ({ ...s, goals: s.goals.filter(x => x.id !== g.id) }))}>Delete goal</button></div>
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <h2>🏅 Achievement badges <span className="muted small">({badges.filter(b => b.unlocked).length}/{badges.length} unlocked)</span></h2>
        <div className="grid g3">
          {badges.map(b => (
            <div key={b.id} className="card" style={b.unlocked ? { borderColor: 'var(--accent)' } : { opacity: 0.62 }}>
              <div style={{ fontSize: 28 }}>{b.unlocked ? b.icon : '🔒'}</div>
              <b>{b.title}</b><div className="muted small">{b.desc}</div>
              <span className="chip" style={{ marginTop: 8 }}>{b.unlocked ? 'Unlocked 🎉' : b.hint}</span>
            </div>
          ))}
        </div>
        <p className="muted small">Milestones show quietly here and as small toasts — never popups over your work.</p>
      </section>

      <section className="card">
        <h2>🔥 Streaks by habit <span className="muted small">(schedule-aware; rest/unscheduled days never break a streak)</span></h2>
        {state.habits.map(h => { const s = habitStreak(state, h); return (
          <div key={h.id} className="row spread" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
            <span>{h.icon} <b>{h.name}</b>{h.paused && <span className="muted"> (paused)</span>}</span>
            <span className="small">Current <b>{s.current}d</b> · Longest <b>{s.longest}d</b></span></div>) })}
      </section>

      {showForm && (
        <Modal title="New goal" onClose={() => setShowForm(false)}>
          <label>Title *</label><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="e.g. 5h coding focus" autoFocus />
          <label>Period</label><select value={f.period} onChange={e => setF({ ...f, period: e.target.value as Goal['period'] })}>
            <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>
          <label>Metric</label><select value={f.metric} onChange={e => setF({ ...f, metric: e.target.value as Goal['metric'] })}>
            <option value="focusMinutes">Focus minutes (timer)</option><option value="completions">Completions</option></select>
          <label>Habit</label><select value={f.habitId} onChange={e => setF({ ...f, habitId: e.target.value })}>
            <option value="">All habits</option>{state.habits.map(h => <option key={h.id} value={h.id}>{h.icon} {h.name}</option>)}</select>
          <label>Target *</label><input type="number" min={1} value={f.target} onChange={e => setF({ ...f, target: Number(e.target.value) })} />
          <div className="row" style={{ marginTop: 16 }}><button className="btn primary" onClick={add}>Create goal</button><button className="btn" onClick={() => setShowForm(false)}>Cancel</button></div>
        </Modal>
      )}
    </div>
  )
}
