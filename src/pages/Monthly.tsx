import { useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { download, Empty, Stat, toCSV } from '../components/ui'
import { dayStats, focusMinutesBetween, habitStreak, isScheduled, logFor, overallStreak } from '../lib/analytics'
import { addDays, fmtMinutes, monthKeys, pad, parseKey, pretty, todayKey } from '../lib/date'
import { useOS } from '../lib/store'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export default function Monthly() {
  const { state, setToast } = useOS()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const keys = useMemo(() => monthKeys(year, month), [year, month])
  const prevKeys = useMemo(() => monthKeys(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1), [year, month])
  const past = keys.filter(k => k <= todayKey())
  const stats = past.map(k => dayStats(state, k))
  const avg = past.length ? Math.round(stats.reduce((a, s) => a + s.pct, 0) / past.length) : 0
  const prevPast = prevKeys.filter(k => k <= todayKey())
  const prevAvg = prevPast.length ? Math.round(prevPast.reduce((a, k) => a + dayStats(state, k).pct, 0) / prevPast.length) : 0
  const focus = focusMinutesBetween(state, keys); const prevFocus = focusMinutesBetween(state, prevKeys)
  const counts = stats.reduce((a, s) => ({ completed: a.completed + s.completed, partial: a.partial + s.partial, skipped: a.skipped + s.skipped, rest: a.rest + s.rest, scheduled: a.scheduled + s.total }), { completed: 0, partial: 0, skipped: 0, rest: 0, scheduled: 0 })
  const missed = Math.max(0, counts.scheduled - counts.completed - counts.partial - counts.skipped - counts.rest - dayStats(state, todayKey()).remaining * (keys.includes(todayKey()) ? 1 : 0))
  const streak = overallStreak(state)
  const sortedDays = [...past].map(k => ({ k, pct: dayStats(state, k).pct })).filter(d => dayStats(state, d.k).total > 0).sort((a, b) => b.pct - a.pct)
  const hasData = keys.some(k => state.logs.some(l => l.date === k)) || focus > 0
  const lead = (parseKey(keys[0]).getDay() + 6) % 7 // Monday-first calendar grid
  const chart = past.map((k, i) => ({ d: Number(k.slice(8)), pct: stats[i].pct }))

  const exportJSON = () => {
    download(`habit-os-month-${year}-${pad(month + 1)}.json`, JSON.stringify({
      exportedAt: new Date().toISOString(), month: `${year}-${pad(month + 1)}`,
      avgCompletionPct: avg, focusMinutes: Math.round(focus), counts, missed,
      logs: state.logs.filter(l => keys.includes(l.date)),
      sessions: state.sessions.filter(s => keys.includes(s.start.slice(0, 10))),
    }, null, 2))
    setToast('Monthly JSON exported 📥')
  }
  const exportCSV = () => {
    const rows = [['Date', 'Habit', 'Status', 'Value', 'Note']]
    for (const k of keys) for (const h of state.habits) {
      const l = logFor(state, h.id, k)
      if (l) rows.push([k, h.name, l.status, String(l.value), l.note])
    }
    download(`habit-os-month-${year}-${pad(month + 1)}.csv`, toCSV(rows), 'text/csv')
    setToast('Monthly CSV exported 📥')
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      <header className="row spread">
        <div><h1>📅 Monthly Report</h1><div className="muted">{MONTHS[month]} {year} analytics from your saved data.</div></div>
        <div className="row">
          <select style={{ width: 150 }} value={month} onChange={e => setMonth(Number(e.target.value))} aria-label="Month">
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select>
          <select style={{ width: 110 }} value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Year">
            {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y}>{y}</option>)}</select>
          <button className="btn" onClick={exportCSV}>📥 CSV</button>
          <button className="btn" onClick={exportJSON}>📥 JSON</button>
        </div>
      </header>
      {!hasData ? <Empty icon="🗓️" title={`No data in ${MONTHS[month]} ${year}`}>Try another month, or load the clearly-labelled demo data from Settings to explore reports.</Empty> : <>
        <section className="grid g4">
          <Stat kicker="Monthly completion" value={`${avg}%`} sub={`${prevAvg}% last month (${avg >= prevAvg ? '+' : ''}${avg - prevAvg} pts)`} />
          <Stat kicker="Focus hours" value={fmtMinutes(focus)} sub={`${fmtMinutes(prevFocus)} last month`} />
          <Stat kicker="Done / Missed / Skipped" value={`${counts.completed} / ${missed} / ${counts.skipped}`} sub={`${counts.partial} partial · ${counts.rest} rest`} />
          <Stat kicker="Streaks" value={`🔥 ${streak.current}d`} sub={`Longest ${streak.longest} days`} />
        </section>
        <p className="small muted">Best day: <b style={{ color: 'var(--text)' }}>{sortedDays[0] ? `${pretty(sortedDays[0].k)} (${sortedDays[0].pct}%)` : '—'}</b> ·
          Weakest day: <b style={{ color: 'var(--text)' }}>{sortedDays.length ? `${pretty(sortedDays[sortedDays.length - 1].k)} (${sortedDays[sortedDays.length - 1].pct}%)` : '—'}</b></p>

        <section className="grid g2">
          <div className="card"><h2>Calendar</h2>
            <div className="cal">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="muted small" style={{ textAlign: 'center', fontWeight: 800 }}>{d}</div>)}
              {Array.from({ length: lead }).map((_, i) => <div key={`x${i}`} />)}
              {keys.map(k => {
                const s = dayStats(state, k)
                const bg = k > todayKey() ? undefined : s.total === 0 ? undefined : `color-mix(in srgb, var(--accent) ${Math.round(s.pct * 0.45)}%, var(--bg2))`
                return <div key={k} className="day" style={{ background: bg, borderColor: k === todayKey() ? 'var(--accent)' : undefined }} title={`${k}: ${s.pct}%`}>
                  {Number(k.slice(8))}<span className="dot" style={{ background: s.pct >= 100 ? 'var(--accent)' : s.pct >= 50 ? 'var(--warn)' : s.pct > 0 ? 'var(--danger)' : undefined }} /></div>
              })}
            </div>
            <p className="muted small">Shading = completion %. Green dot 100% · yellow ≥50% · red &gt;0%.</p>
          </div>
          <div className="card"><h2>Daily completion trend</h2>
            <div style={{ height: 230 }}><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart}>
              <CartesianGrid stroke="rgba(255,255,255,.07)" /><XAxis dataKey="d" stroke="#94a39b" fontSize={11} />
              <YAxis stroke="#94a39b" fontSize={12} domain={[0, 100]} unit="%" /><Tooltip />
              <Area dataKey="pct" name="Completion %" stroke="#22d3ee" fill="rgba(34,211,238,.25)" /></AreaChart></ResponsiveContainer></div>
            <h3 style={{ marginTop: 14 }}>Focus by habit</h3>
            {state.habits.map(h => { const f = focusMinutesBetween(state, keys, h.id); return f > 0 ?
              <div key={h.id} className="row spread" style={{ padding: '4px 0' }}><span className="small">{h.icon} {h.name}</span><b className="small">{fmtMinutes(f)}</b></div> : null })}
            {focus === 0 && <p className="muted small">No timer sessions this month.</p>}
          </div>
        </section>

        <section className="card">
          <h2>🔥 Consistency heatmap <span className="muted small">(last 84 days per habit)</span></h2>
          <div style={{ overflowX: 'auto' }} className="grid">
            {state.habits.filter(h => !h.paused).map(h => (
              <div key={h.id}>
                <div className="small" style={{ marginBottom: 5 }}><b>{h.icon} {h.name}</b> <span className="muted">streak {habitStreak(state, h).current} · best {habitStreak(state, h).longest}</span></div>
                <div className="heat" style={{ gridTemplateColumns: 'repeat(42, 15px)' }}>
                  {Array.from({ length: 84 }, (_, i) => addDays(todayKey(), -(83 - i))).map(k => {
                    const l = logFor(state, h.id, k); const sched = isScheduled(h, k)
                    const bg = !sched ? 'transparent' : l?.status === 'completed' ? h.color : l?.status === 'partial' ? 'color-mix(in srgb,' + h.color + ' 45%,transparent)' : l?.status === 'rest' ? '#a78bfa66' : undefined
                    return <div key={k} className="cell" title={`${h.name} · ${k} · ${sched ? (l?.status || (k < todayKey() ? 'missed' : 'pending')) : 'not scheduled'}`} style={{ background: bg }} />
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </>}
    </div>
  )
}
