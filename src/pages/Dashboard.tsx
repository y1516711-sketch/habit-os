import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import HabitDayRow from '../components/HabitDayRow'
import DailyHooks from '../components/DailyHooks'
import { Empty, ProgressRing, Stat } from '../components/ui'
import { dayStats, focusMinutesOn, insights, motivationForToday, overallStreak, scheduledOn, xpAndLevel } from '../lib/analytics'
import { addDays, fmtMinutes, pretty, prettyLong, todayKey, weekKeys } from '../lib/date'
import { useOS } from '../lib/store'
import type { Habit } from '../lib/types'

export default function Dashboard({ go }: { go: (p: string) => void }) {
  const { state, update } = useOS()
  const today = todayKey()
  const stats = dayStats(state, today)
  const streak = overallStreak(state)
  const xp = xpAndLevel(state)
  const todays = scheduledOn(state, today)
  const todaySessions = state.sessions.filter(s => s.start.slice(0, 10) === today)
  const remainingLabel = stats.remaining > 0
    ? `${stats.remaining} habit${stats.remaining === 1 ? '' : 's'} left`
    : stats.total > 0 ? 'All habits checked off' : 'Set up your first habit'
  const tomorrow = scheduledOn(state, addDays(today, 1))
  const wk = weekKeys(today, state.settings.weekStart)
  const chart = wk.map(k => ({ day: pretty(k).split(' ')[0], pct: dayStats(state, k).pct, focus: Math.round(focusMinutesOn(state, k)) }))
  const recent = [...state.logs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6)
  const nameOf = (id: string) => state.habits.find(h => h.id === id)?.name || 'Deleted habit'
  const startTimer = (h: Habit) => {
    update(s => ({ ...s, timer: { ...s.timer, habitId: h.id } }))
    go('timer')
  }
  return (
    <div className="dashboard-shell grid" style={{ gap: 18 }}>
      <header className="dashboard-hero row spread">
        <div>
          <div className="dashboard-eyebrow">HABIT OS <span>✦</span> YOUR DAILY CONTROL CENTER</div>
          <h1>Today Hub <span className="dashboard-spark">✦</span></h1>
          <div className="dashboard-welcome">{state.settings.userName ? `Hey ${state.settings.userName}, let's make today count.` : 'Welcome back — one small win at a time.'}</div>
          <div className="muted dashboard-date">{prettyLong(today)} · “{motivationForToday()}”</div>
          {state.demo && <span className="chip" style={{ marginTop: 6 }}>🧪 Demo data loaded — reset anytime in Settings</span>}
        </div>
        <div className="dashboard-hero-action"><span className="dashboard-live-dot" /> {remainingLabel} <button className="btn primary" onClick={() => go('timer')}>⏱️ Start a focus session</button></div>
        <div className="dashboard-hero-summary" aria-label={`Today's progress ${stats.pct}%`}>
          <div className="dashboard-summary-value">{stats.pct}%</div>
          <div className="dashboard-summary-label">today complete</div>
          <div className="dashboard-summary-meta">⏱️ {fmtMinutes(focusMinutesOn(state, today))} focus · 🔥 {streak.current}d streak</div>
        </div>
      </header>

      <section className="dashboard-stats grid g4">
        <Stat kicker="Scheduled today" value={stats.total} sub={`${stats.completed} done · ${stats.remaining} remaining`} />
        <Stat kicker="Focus today" value={fmtMinutes(focusMinutesOn(state, today))} sub={`${todaySessions.length} session${todaySessions.length === 1 ? '' : 's'} today`} />
        <Stat kicker="Current streak" value={`🔥 ${streak.current}d`} sub={`Longest ${streak.longest} days (≥70% days)`} />
        <Stat kicker={`Level ${xp.level}`} value={`${xp.xp} XP`} sub={`${xp.toNext} XP to next level`} />
      </section>
      <div className="dashboard-xp"><div className="row spread"><span className="kicker">Level {xp.level} progress</span><span className="muted small">{xp.xp} / {xp.xp + xp.toNext} XP</span></div><div className="bar" aria-label="XP progress"><i style={{ width: `${xp.progress}%` }} /></div></div>
      <div className="row">
        <span className="chip">🪙 Coins — Goals page par dekho</span>
        <span className="chip">🎯 Aaj ke 3 Daily Quests waiting hai!</span>
        <button className="btn small" onClick={() => go('coach')}>🧠 AI Coach se poochho</button>
        <button className="btn small" onClick={() => go('share')}>📸 Share Card banao</button>
        <button className="btn small" onClick={() => go('goals')}>🛒 Reward Shop</button>
      </div>

      <DailyHooks go={go} />

      <section className="dashboard-progress-grid grid" style={{ gridTemplateColumns: 'minmax(230px,320px) 1fr', gap: 14 }}>
        <div className="card dashboard-depth-card" style={{ textAlign: 'center' }}>
          <div className="kicker">Today's completion</div>
          <div style={{ margin: '14px 0' }}><ProgressRing pct={stats.pct} label={`${stats.completed}/${Math.max(0, stats.total - stats.rest)} habits`} /></div>
          <div className="muted small">Partial = 50%. Rest days don't lower your score.</div>
        </div>
        <div className="card dashboard-depth-card">
          <h2>📊 This week ({pretty(wk[0])} – {pretty(wk[6])})</h2>
          {state.logs.length === 0
            ? <Empty title="No data this week yet">Tick a habit below and your real chart appears here.</Empty>
            : <div style={{ height: 220 }}><ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid stroke="rgba(255,255,255,.07)" /><XAxis dataKey="day" stroke="#94a39b" fontSize={12} />
                  <YAxis stroke="#94a39b" fontSize={12} domain={[0, 100]} unit="%" /><Tooltip />
                  <Bar dataKey="pct" name="Completion %" fill="#22ff88" radius={[6, 6, 0, 0]} />
                </BarChart></ResponsiveContainer></div>}
        </div>
      </section>

      <section>
        <div className="row spread"><h2>✅ Today's checklist</h2><button className="btn small" onClick={() => go('daily')}>Open Daily Tracker →</button></div>
        <div className="grid" style={{ gap: 9, marginTop: 8 }}>
          {todays.length === 0
            ? <Empty icon="💤" title="Nothing scheduled today">Add a habit or adjust schedules in Habits Management.</Empty>
            : todays.map(h => <HabitDayRow key={h.id} habit={h} date={today} onStartTimer={startTimer} />)}
        </div>
      </section>

      <section className="grid g3">
        <div className="card"><h2>🕘 Recent activity</h2>
          {recent.length === 0 ? <p className="muted small">Your latest check-ins will show here.</p>
            : recent.map(l => <div key={l.id} className="row spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="small"><b>{nameOf(l.habitId)}</b> <span className="muted">{l.status}</span></span><span className="muted small">{pretty(l.date)}</span></div>)}
        </div>
        <div className="card"><h2>📅 Tomorrow</h2>
          {tomorrow.length === 0 ? <p className="muted small">Rest day — nothing scheduled tomorrow.</p>
            : tomorrow.map(h => <div key={h.id} className="row" style={{ padding: '5px 0' }}><span>{h.icon}</span><span className="small"><b>{h.name}</b> <span className="muted">· {h.target} {h.unit}{h.reminderTime ? ` · 🔔 ${h.reminderTime}` : ''}</span></span></div>)}
        </div>
        <div className="card"><h2>💡 Smart insights</h2><p className="muted small" style={{ marginTop: -6 }}>Local rules from your saved data — no AI API, nothing invented.</p>
          {insights(state).map((t, i) => <p key={i} className="small">• {t}</p>)}
        </div>
      </section>
    </div>
  )
}
