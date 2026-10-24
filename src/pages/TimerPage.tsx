import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Modal } from '../components/ui'
import { focusMinutesOn } from '../lib/analytics'
import { fmtClock, fmtMinutes, pretty, todayKey, uid } from '../lib/date'
import { useOS } from '../lib/store'
import type { TimerMode } from '../lib/types'

export default function TimerPage() {
  const { state, update, upsertLog, setToast } = useOS()
  const t = state.timer
  const [tick, setTick] = useState(0)
  const [countMin, setCountMin] = useState(state.settings.countdownDefaultMin)
  const [note, setNote] = useState('')
  const [askComplete, setAskComplete] = useState<null | { habitId: string; minutes: number }>(null)
  const finishing = useRef(false)
  const rangRef = useRef(false)

  useEffect(() => {
    if (t.status !== 'running') return
    const iv = setInterval(() => setTick(x => x + 1), 250)
    return () => clearInterval(iv)
  }, [t.status])

  const elapsed = useMemo(() => {
    const seg = t.status === 'running' && t.segmentStart ? (Date.now() - t.segmentStart) / 1000 : 0
    return Math.max(0, t.accumulatedSec + seg) // paused time is never added
  }, [t, tick, state.sessions.length])

  const habit = state.habits.find(h => h.id === t.habitId)
  const display = t.mode === 'stopwatch' ? elapsed : Math.max(0, t.targetSec - elapsed)
  const done = t.mode !== 'stopwatch' && elapsed >= t.targetSec && t.targetSec > 0

  useEffect(() => {
    if (done && t.status === 'running' && !rangRef.current) {
      rangRef.current = true
      try {
        const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.07
        o.start(); o.stop(ctx.currentTime + 0.5)
      } catch { /* audio optional */ }
      if (state.settings.notifications && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('⏰ HABIT OS timer finished', { body: habit ? `${habit.name} session complete.` : 'Session complete.' })
      }
      // A completed countdown/Pomodoro is a real focus session. Save it now so
      // Focus today and all reports update even if the user misses the button.
      finish()
      setToast('⏰ Time complete — session saved automatically.')
    }
    if (!done) rangRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done])

  const targetFor = (mode: TimerMode, phase: 'focus' | 'break') =>
    mode === 'pomodoro' ? (phase === 'focus' ? state.settings.pomodoroFocusMin : state.settings.pomodoroBreakMin) * 60
      : mode === 'countdown' ? countMin * 60 : 0

  const start = () => {
    if (!t.habitId) return setToast('Pick a habit first, then start.')
    if (t.mode !== 'stopwatch' && t.targetSec <= 0) return setToast('Set a timer duration first.')
    update(s => ({
      ...s, timer: {
        ...s.timer, status: 'running', segmentStart: Date.now(),
        targetSec: s.timer.accumulatedSec === 0 ? targetFor(s.timer.mode, s.timer.phase) : s.timer.targetSec,
        sessionStartISO: s.timer.sessionStartISO || new Date().toISOString(),
      },
    }))
  }
  const pause = () => update(s => {
    if (s.timer.status !== 'running' || !s.timer.segmentStart) return s
    const add = (Date.now() - s.timer.segmentStart) / 1000
    return { ...s, timer: { ...s.timer, status: 'paused', segmentStart: null, accumulatedSec: s.timer.accumulatedSec + add } }
  })
  const reset = () => { finishing.current = false; update(s => ({ ...s, timer: { ...s.timer, status: 'idle', segmentStart: null, accumulatedSec: 0, sessionStartISO: null, targetSec: targetFor(s.timer.mode, s.timer.phase) } })) }
  const setMode = (mode: TimerMode) => {
    if (t.status !== 'idle') return setToast('Reset the current timer before changing mode.')
    update(s => ({ ...s, timer: { ...s.timer, mode, phase: 'focus', status: 'idle', segmentStart: null, accumulatedSec: 0, sessionStartISO: null, targetSec: targetFor(mode, 'focus') } }))
  }
  const switchPhase = () => {
    if (t.status !== 'idle') return setToast('Finish or reset the current timer before switching phase.')
    update(s => {
      const phase = s.timer.phase === 'focus' ? 'break' : 'focus'
      return { ...s, timer: { ...s.timer, phase, status: 'idle', segmentStart: null, accumulatedSec: 0, sessionStartISO: null, targetSec: targetFor('pomodoro', phase) } }
    })
  }

  const finish = () => {
    if (finishing.current) return // ← double-click guard: one session record only
    if (!t.habitId) return setToast('Pick a habit first.')
    const total = Math.round(elapsed)
    if (total < 5) return setToast('Session is under 5 seconds — nothing to save yet.')
    finishing.current = true
    const habitId = t.habitId
    update(s => ({
      ...s,
      sessions: [...s.sessions, {
        id: uid(), habitId, start: s.timer.sessionStartISO || new Date(Date.now() - total * 1000).toISOString(),
        end: new Date().toISOString(), durationSec: total, mode: s.timer.mode, phase: s.timer.phase, note,
      }],
      timer: { ...s.timer, status: 'idle', segmentStart: null, accumulatedSec: 0, sessionStartISO: null },
    }))
    setNote('')
    // Ask — never auto-assume the whole habit is complete.
    if (t.phase === 'focus') setAskComplete({ habitId, minutes: Math.round(total / 60) })
    else setToast('Break saved. Ready for the next round 💪')
    setTimeout(() => { finishing.current = false }, 800)
  }

  const today = todayKey()
  const recent = [...state.sessions].sort((a, b) => b.start.localeCompare(a.start)).slice(0, 10)
  const nameOf = (id: string) => state.habits.find(h => h.id === id)?.name || 'Deleted habit'
  const progress = t.mode === 'stopwatch' ? 0 : t.targetSec ? Math.min(100, (elapsed / t.targetSec) * 100) : 0
  const modeLabel = t.mode === 'pomodoro' ? 'POMODORO' : t.mode === 'stopwatch' ? 'STOPWATCH' : 'COUNTDOWN'
  const phaseLabel = t.mode === 'pomodoro' ? (t.phase === 'focus' ? 'DEEP FOCUS' : 'RECOVERY BREAK') : 'SINGLE SESSION'

  return (
    <div className="grid" style={{ gap: 18 }}>
      <header><h1>⏱️ Timer / Focus Mode</h1>
        <div className="muted">Refresh-safe: a running timer survives reloads. Paused time never counts as focus.</div></header>

      <section className={`timer-panel card ${t.status === 'running' ? 'is-running' : ''}`}>
        <div className="timer-panel-top">
          <div>
            <div className="kicker">Focus control room</div>
            <h2 className="timer-title">Make time count.</h2>
          </div>
          <div className={`timer-status ${t.status}`}><span />{t.status === 'running' ? 'LIVE SESSION' : t.status === 'paused' ? 'PAUSED' : 'READY'}</div>
        </div>
        <div className="timer-mode-row" role="tablist" aria-label="Timer mode">
          {(['pomodoro', 'stopwatch', 'countdown'] as TimerMode[]).map(m => (
            <button key={m} className={`timer-mode-btn ${t.mode === m ? 'active' : ''}`} aria-pressed={t.mode === m} onClick={() => setMode(m)}>
              {m === 'pomodoro' ? '🍅 Pomodoro' : m === 'stopwatch' ? '⌚ Stopwatch' : '⏳ Countdown'}</button>))}
          {t.mode === 'pomodoro' && <button className="timer-phase-btn" onClick={switchPhase}>{t.phase === 'focus' ? '☕ Take a break' : '🎯 Back to focus'}</button>}
        </div>
        <div className="timer-workspace">
          <div className="timer-identity">
            <div className="timer-avatar">{habit?.icon || '⚡'}</div>
            <div><div className="kicker">{phaseLabel}</div><b>{habit?.name || 'Choose a habit to begin'}</b><div className="muted small">{modeLabel} · {t.mode === 'stopwatch' ? 'Count your deep work' : `${fmtClock(t.targetSec)} target`}</div></div>
          </div>
          <div className="timer-ring" style={{ '--timer-progress': `${progress}%` } as CSSProperties}>
            <div className="timer-ring-glow" />
            <div className="timer-ring-inner"><span className="timer-ring-label">{t.status === 'running' ? 'IN THE ZONE' : done ? 'COMPLETE' : 'READY WHEN YOU ARE'}</span><div className="timer-face" aria-live="off">{fmtClock(display)}</div><span className="timer-ring-sub">{t.mode === 'stopwatch' ? 'elapsed focus' : `${Math.round(progress)}% complete`}</span></div>
          </div>
          <div className="timer-side-info">
            <div className="timer-mini-card"><span>Session goal</span><b>{t.mode === 'stopwatch' ? '∞' : fmtClock(t.targetSec)}</b></div>
            <div className="timer-mini-card"><span>Today’s focus</span><b>{fmtMinutes(focusMinutesOn(state, today))}</b></div>
            <div className="timer-mini-card"><span>Active time</span><b>{fmtClock(Math.min(elapsed, t.targetSec || elapsed))}</b></div>
          </div>
        </div>
        <div className="timer-settings">
          <label>Habit for this session *</label>
          <select value={t.habitId} disabled={t.status !== 'idle'} onChange={e => update(s => ({ ...s, timer: { ...s.timer, habitId: e.target.value } }))}>
            <option value="">— Select a habit —</option>
            {state.habits.filter(h => !h.paused).map(h => <option key={h.id} value={h.id}>{h.icon} {h.name} (target {h.target} {h.unit})</option>)}
          </select>
          {t.mode === 'countdown' && t.status === 'idle' && (<>
            <label>Countdown minutes</label>
            <input type="number" min={1} max={480} value={countMin} disabled={t.status !== 'idle'} onChange={e => { const v = Math.min(480, Math.max(1, Number(e.target.value) || 1)); setCountMin(v); update(s => ({ ...s, timer: { ...s.timer, targetSec: v * 60 } })) }} />
          </>)}
          {t.mode === 'pomodoro' && <p className="muted small">Focus {state.settings.pomodoroFocusMin} min · Break {state.settings.pomodoroBreakMin} min (change in Settings).</p>}
          <label>Session note (optional)</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="What will you work on?" />
        </div>
        <div className="timer-controls">
          {t.status !== 'running'
            ? <button className="btn primary timer-start" onClick={start}>{t.status === 'paused' ? '▶ Resume focus' : '▶ Start focus'}</button>
            : <button className="btn primary timer-start" onClick={pause}>⏸ Pause focus</button>}
          <button className="btn" onClick={reset}>↺ Reset</button>
          <button className="btn" onClick={finish} disabled={elapsed < 5}>Save session</button>
        </div>
      </section>

      <section className="card">
        <h2>🕘 Session history</h2>
        {recent.length === 0 ? <p className="muted small">No sessions yet. Finished sessions appear here with start, end, duration, habit and notes.</p>
          : <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Habit</th><th>Start</th><th>End</th><th>Duration</th><th>Mode</th><th>Note</th><th></th></tr></thead>
            <tbody>{recent.map(s => (
              <tr key={s.id}><td><b>{nameOf(s.habitId)}</b></td>
                <td>{pretty(s.start.slice(0, 10))} {new Date(s.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td>{new Date(s.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td>{fmtMinutes(s.durationSec / 60)}</td><td>{s.mode}{s.phase === 'break' ? ' · break' : ''}</td><td className="muted">{s.note || '—'}</td>
                <td><button className="btn small danger" onClick={() => update(x => ({ ...x, sessions: x.sessions.filter(y => y.id !== s.id) }))}>Delete</button></td></tr>))}
            </tbody></table></div>}
        {habit && <p className="muted small">All-time focus on {habit.icon} {habit.name}: <b style={{ color: 'var(--text)' }}>{fmtMinutes(state.sessions.filter(s => s.habitId === habit.id && s.phase !== 'break').reduce((a, s) => a + s.durationSec, 0) / 60)}</b></p>}
      </section>

      {askComplete && (
        <Modal title="Session saved ✅" onClose={() => setAskComplete(null)}>
          <p>You focused <b>{askComplete.minutes} min</b> on <b>{nameOf(askComplete.habitId)}</b>.</p>
          <p className="muted small">Should today's habit be marked complete? A timer session doesn't always mean the full habit is done — you choose.</p>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={() => { const h = state.habits.find(x => x.id === askComplete.habitId); upsertLog(askComplete.habitId, todayKey(), 'completed', h?.target ?? askComplete.minutes); setAskComplete(null); setToast('Marked complete 🎉') }}>✅ Mark complete</button>
            <button className="btn" onClick={() => { upsertLog(askComplete.habitId, todayKey(), 'partial', askComplete.minutes); setAskComplete(null); setToast('Marked partial 🟡') }}>🟡 Partial only</button>
            <button className="btn" onClick={() => { setAskComplete(null); setToast('Session saved — habit left as-is.') }}>Just save session</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
