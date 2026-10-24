import { useState } from 'react'
import HabitDayRow from '../components/HabitDayRow'
import { Empty, ProgressRing, Stat } from '../components/ui'
import { dayStats, focusMinutesOn, scheduledOn } from '../lib/analytics'
import { addDays, fmtMinutes, prettyLong, todayKey } from '../lib/date'
import { useOS } from '../lib/store'
import type { Habit } from '../lib/types'

export default function Daily({ go }: { go: (p: string) => void }) {
  const { state, update } = useOS()
  const [date, setDate] = useState(todayKey())
  const [filter, setFilter] = useState('All')
  const cats = ['All', ...state.categories]
  const stats = dayStats(state, date)
  const list = scheduledOn(state, date).filter(h => filter === 'All' || h.category === filter)
  const unscheduled = state.habits.filter(h => !h.paused && !scheduledOn(state, date).some(s => s.id === h.id))
  const startTimer = (h: Habit) => { update(s => ({ ...s, timer: { ...s.timer, habitId: h.id } })); go('timer') }
  return (
    <div className="grid" style={{ gap: 18 }}>
      <header>
        <h1>📋 Daily Tracker</h1>
        <div className="muted">View or edit any day — one record per habit per date, always.</div>
      </header>
      <div className="card row spread">
        <div className="row">
          <button className="btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">←</button>
          <input type="date" style={{ width: 175 }} value={date} max={addDays(todayKey(), 7)} onChange={e => e.target.value && setDate(e.target.value)} aria-label="Pick date" />
          <button className="btn" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">→</button>
          <button className="btn" onClick={() => setDate(todayKey())}>Today</button>
        </div>
        <b>{prettyLong(date)}</b>
      </div>
      <section className="grid g4">
        <Stat kicker="Scheduled" value={stats.total} />
        <Stat kicker="Completed" value={stats.completed} sub={`${stats.partial} partial · ${stats.skipped} skipped · ${stats.rest} rest`} />
        <Stat kicker="Remaining" value={stats.remaining} />
        <Stat kicker="Focus time" value={fmtMinutes(focusMinutesOn(state, date))} />
      </section>
      <div className="row spread">
        <div className="row" role="group" aria-label="Category filter">
          {cats.map(c => <button key={c} className="btn small" aria-pressed={filter === c} style={filter === c ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => setFilter(c)}>{c}</button>)}
        </div>
        <div style={{ width: 92 }}><ProgressRing pct={stats.pct} size={92} /></div>
      </div>
      <section className="grid" style={{ gap: 9 }}>
        {list.length === 0
          ? <Empty icon="💤" title="No habits scheduled">Nothing is scheduled for this day{filter !== 'All' ? ` in "${filter}"` : ''}. Unscheduled days never count as missed.</Empty>
          : list.map(h => <HabitDayRow key={h.id} habit={h} date={date} onStartTimer={startTimer} />)}
      </section>
      {unscheduled.length > 0 && (
        <p className="muted small">Not scheduled this day (never counted as missed): {unscheduled.map(h => `${h.icon} ${h.name}`).join(' · ')}</p>
      )}
    </div>
  )
}
