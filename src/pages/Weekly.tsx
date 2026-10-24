import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Empty, Stat } from '../components/ui'
import { dayStats, focusMinutesBetween, focusMinutesOn, isScheduled, logFor } from '../lib/analytics'
import { addDays, fmtMinutes, pretty, todayKey, toKey, weekKeys } from '../lib/date'
import { useOS } from '../lib/store'

export default function Weekly() {
  const { state } = useOS()
  const [anchor, setAnchor] = useState(todayKey())
  const wk = weekKeys(anchor, state.settings.weekStart) // Mon–Sun by default
  const prevWk = wk.map(k => addDays(k, -7))
  const today = todayKey()
  const stateOn = (key: string) => ({ ...state, habits: state.habits.filter(h => toKey(new Date(h.createdAt)) <= key) })
  const stats = wk.map(k => dayStats(stateOn(k), k))
  const prevStats = prevWk.map(k => dayStats(stateOn(k), k))
  const reportableDay = (key: string, s: typeof stats[number]) => key <= today && s.total > s.rest + s.freeze
  const evaluatedDays = wk.map((key, i) => ({ key, stats: stats[i] })).filter(({ key, stats: s }) => reportableDay(key, s))
  const evaluatedPrevDays = prevWk.map((key, i) => ({ key, stats: prevStats[i] })).filter(({ key, stats: s }) => reportableDay(key, s))
  const avg = evaluatedDays.length ? Math.round(evaluatedDays.reduce((a, d) => a + d.stats.pct, 0) / evaluatedDays.length) : 0
  const prevAvg = evaluatedPrevDays.length ? Math.round(evaluatedPrevDays.reduce((a, d) => a + d.stats.pct, 0) / evaluatedPrevDays.length) : 0
  const focus = focusMinutesBetween(state, wk); const prevFocus = focusMinutesBetween(state, prevWk)
  const bestDay = [...evaluatedDays].sort((a, b) => b.stats.pct - a.stats.pct)[0]
  const hasData = wk.some(k => state.logs.some(l => l.date === k)) || focus > 0

  const perHabit = state.habits.map(h => {
    let done = 0, sched = 0, missed = 0, skipped = 0
    for (const k of wk) {
      if (k > today) continue
      if (toKey(new Date(h.createdAt)) > k) continue
      if (!isScheduled(h, k)) continue
      const l = logFor(state, h.id, k)
      if (l?.status === 'rest' || l?.status === 'freeze') continue
      sched++
      if (l?.status === 'completed') done++
      else if (l?.status === 'partial') done += 0.5
      else if (l?.status === 'skipped') skipped++
      else if (k < todayKey()) missed++
    }
    return { h, rate: sched ? Math.round((done / sched) * 100) : 0, done, sched, missed, skipped, focus: focusMinutesBetween(state, wk, h.id) }
  }).sort((a, b) => b.rate - a.rate)
  const bestHabit = perHabit.find(p => p.sched > 0)
  const totalMissed = perHabit.reduce((a, p) => a + p.missed, 0)
  const totalSkipped = perHabit.reduce((a, p) => a + p.skipped, 0)
  const chart = wk.map((k, i) => ({
    day: pretty(k),
    pct: reportableDay(k, stats[i]) ? stats[i].pct : null,
    prev: reportableDay(prevWk[i], prevStats[i]) ? prevStats[i].pct : null,
    focus: Math.round(focusMinutesOn(state, k)),
  }))
  const pie = perHabit.filter(p => p.focus > 0).map(p => ({ name: p.h.name, value: Math.round(p.focus), color: p.h.color }))
  const delta = (now: number, prev: number) => (prev === 0 ? (now > 0 ? 'new this week' : '—') : `${now >= prev ? '▲' : '▼'} ${Math.abs(now - prev)} vs last week`)

  return (
    <div className="grid" style={{ gap: 18 }}>
      <header className="row spread">
        <div><h1>📈 Weekly Report</h1><div className="muted">{pretty(wk[0])} → {pretty(wk[6])} ({state.settings.weekStart}-start week)</div></div>
        <div className="row">
          <button className="btn" onClick={() => setAnchor(addDays(anchor, -7))}>← Prev week</button>
          <button className="btn" onClick={() => setAnchor(todayKey())}>This week</button>
          <button className="btn" onClick={() => setAnchor(addDays(anchor, 7))}>Next week →</button>
        </div>
      </header>
      {!hasData ? <Empty icon="📅" title="No data in this week">Log habits or run the timer — this report only shows your real saved data.</Empty> : <>
        <section className="grid g4">
          <Stat kicker="Avg completion" value={`${avg}%`} sub={delta(avg, prevAvg) + ` (${prevAvg}%)`} />
          <Stat kicker="Focus time" value={fmtMinutes(focus)} sub={`${fmtMinutes(prevFocus)} last week`} />
          <Stat kicker="Best day" value={bestDay ? pretty(bestDay.key) : '—'} sub={bestDay ? `${bestDay.stats.pct}% completion` : ''} />
          <Stat kicker="Best habit" value={bestHabit ? `${bestHabit.h.icon} ${bestHabit.h.name}` : '—'} sub={bestHabit ? `${bestHabit.rate}% · ${fmtMinutes(bestHabit.focus)} focus` : ''} />
        </section>
        <section className="grid g2">
          <div className="card"><h2>Daily completion (vs previous week)</h2>
            <div style={{ height: 240 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={chart}>
              <CartesianGrid stroke="rgba(255,255,255,.07)" /><XAxis dataKey="day" stroke="#94a39b" fontSize={11} interval={0} angle={-18} textAnchor="end" height={52} />
              <YAxis stroke="#94a39b" fontSize={12} domain={[0, 100]} unit="%" /><Tooltip />
              <Bar dataKey="pct" name="This week %" fill="#22ff88" radius={[5, 5, 0, 0]} />
              <Bar dataKey="prev" name="Last week %" fill="#64748b" radius={[5, 5, 0, 0]} />
            </BarChart></ResponsiveContainer></div></div>
          <div className="card"><h2>Focus minutes by habit</h2>
            {pie.length === 0 ? <p className="muted small">No timer sessions this week.</p>
              : <div style={{ height: 240 }}><ResponsiveContainer width="100%" height="100%"><PieChart>
                <Tooltip /><Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                  {pie.map(p => <Cell key={p.name} fill={p.color} />)}</Pie></PieChart></ResponsiveContainer></div>}
            <div className="row">{pie.map(p => <span key={p.name} className="chip">{p.name}: {p.value}m</span>)}</div>
          </div>
        </section>
        <section className="card">
          <h2>Detailed table — missed {totalMissed} · skipped {totalSkipped}</h2>
          <div style={{ overflowX: 'auto' }}><table>
            <thead><tr><th>Habit</th>{wk.map(k => <th key={k}>{pretty(k)}</th>)}<th>Rate</th><th>Focus</th></tr></thead>
            <tbody>{perHabit.map(({ h, rate, focus: f }) => (
              <tr key={h.id}><td><b>{h.icon} {h.name}</b></td>
                {wk.map(k => {
                  if (!isScheduled(h, k)) return <td key={k} className="muted" title="Not scheduled">·</td>
                  const l = logFor(state, h.id, k)
                  const sym = l?.status === 'completed' ? '✅' : l?.status === 'partial' ? '🟡' : l?.status === 'skipped' ? '⏭️' : l?.status === 'freeze' ? '🧊' : l?.status === 'rest' ? '💤' : k < todayKey() ? '❌' : '—'
                  return <td key={k}>{sym}</td>
                })}
                <td><b>{rate}%</b></td><td>{fmtMinutes(f)}</td></tr>
            ))}
              <tr><td><b>Day %</b></td>{stats.map((s, i) => <td key={i}><b>{reportableDay(wk[i], s) ? `${s.pct}%` : '—'}</b></td>)}<td><b>{avg}%</b></td><td><b>{fmtMinutes(focus)}</b></td></tr>
            </tbody></table></div>
          <p className="muted small">· = unscheduled (never a miss) · 💤 rest excluded from rates · ❌ past scheduled day with no log.</p>
        </section>
      </>}
    </div>
  )
}
