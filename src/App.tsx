import { useEffect, useRef, useState } from 'react'
import Dashboard from './pages/Dashboard'
import Daily from './pages/Daily'
import GoalsPage from './pages/GoalsPage'
import HabitsPage from './pages/HabitsPage'
import Monthly from './pages/Monthly'
import NotesPage from './pages/NotesPage'
import SettingsPage from './pages/SettingsPage'
import TimerPage from './pages/TimerPage'
import Weekly from './pages/Weekly'
import AICoach from './pages/AICoach'
import SharePage from './pages/SharePage'
import { scheduleNativeReminders } from './lib/native'
import OnboardingWizard from './components/OnboardingWizard'
import { xpAndLevel } from './lib/analytics'
import { pad, todayKey } from './lib/date'
import { useOS } from './lib/store'

const NAV = [
  { id: 'dashboard', icon: '✦', label: 'Today Hub' },
  { id: 'daily', icon: '📋', label: 'Daily Tracker' },
  { id: 'timer', icon: '⏱️', label: 'Timer / Focus' },
  { id: 'habits', icon: '🗂️', label: 'Habits' },
  { id: 'weekly', icon: '📈', label: 'Weekly Report' },
  { id: 'monthly', icon: '📅', label: 'Monthly Report' },
  { id: 'goals', icon: '🎯', label: 'Goals & Badges' },
  { id: 'coach', icon: '🧠', label: 'AI Coach' },
  { id: 'share', icon: '📸', label: 'Share Card' },
  { id: 'notes', icon: '📓', label: 'Notes / Journal' },
  { id: 'settings', icon: '⚙️', label: 'Settings & Backup' },
]
interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export default function App() {
  const { state, ready, toast, setToast } = useOS()
  const [page, setPage] = useState('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [installEv, setInstallEv] = useState<BIPEvent | null>(null)
  const [showInstall, setShowInstall] = useState(() => sessionStorage.getItem('hb-install-dismissed') !== '1')
  const xp = xpAndLevel(state)
  const levelRef = useRef(xp.level)

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme
    document.documentElement.dataset.accent = state.settings.accent
  }, [state.settings.theme, state.settings.accent])

  // Quiet milestone toast when levelling up (non-distracting).
  useEffect(() => {
    if (!ready) { levelRef.current = xp.level; return } // sync on load, don't toast for saved levels
    if (xp.level > levelRef.current) setToast(`🎉 Level up! You reached Level ${xp.level}`)
    levelRef.current = xp.level
  }, [xp.level, ready, setToast])

  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setInstallEv(e as BIPEvent) }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])

  // Native app: schedule local notifications and refresh the rolling window on return.
  useEffect(() => {
    if (!ready) return
    const sync = () => { void scheduleNativeReminders(state) }
    const onVisible = () => { if (document.visibilityState === 'visible') sync() }
    sync()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, state.settings.notifications, state.habits])

  // Reminder checker: every 30s while the app is open (web/PWA fallback).
  useEffect(() => {
    if (!state.settings.notifications) return
    const check = () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      const now = new Date(); const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`
      for (const h of state.habits) {
        if (h.paused || h.reminderTime !== hm) continue
        const key = `hb-notified-${h.id}-${todayKey()}`
        if (sessionStorage.getItem(key)) continue
        const done = state.logs.some(l => l.habitId === h.id && l.date === todayKey() && l.status === 'completed')
        if (!done) new Notification(`🔔 ${h.icon} ${h.name}`, { body: `Time for ${h.target} ${h.unit}. Open HABIT OS to start.` })
        sessionStorage.setItem(key, '1')
      }
    }
    check(); const iv = setInterval(check, 30000)
    return () => clearInterval(iv)
  }, [state.settings.notifications, state.habits, state.logs])

  const go = (p: string) => { setPage(p); setMenuOpen(false); window.scrollTo({ top: 0 }) }
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches

  if (!ready) return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}><div><div style={{ fontSize: 40, textAlign: 'center' }}>⚡</div><p className="muted">Loading HABIT OS from this device…</p></div></div>

  return (
    <div className="layout">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="logo">HABIT<span>OS</span><small>PERSONAL PROGRESS SYSTEM</small></div>
        <nav className="nav" aria-label="Main">
          {NAV.map(n => <button key={n.id} className={page === n.id ? 'on' : ''} onClick={() => go(n.id)}><span aria-hidden>{n.icon}</span>{n.label}</button>)}
        </nav>
        <div style={{ marginTop: 'auto' }} className="card">
          <div className="kicker">🏆 Level {xp.level} · {xp.xp} XP</div>
          <div className="bar" style={{ marginTop: 8 }}><i style={{ width: `${xp.progress}%` }} /></div>
          <div className="muted small" style={{ marginTop: 6 }}>Free forever · data saved on this device 💾</div>
        </div>
      </aside>
      {menuOpen && <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} aria-hidden />}

      <main className="main">
        <div className="topbar">
          <button className="btn small" onClick={() => setMenuOpen(v => !v)} aria-label="Menu">☰</button>
          <b>HABIT <span style={{ color: 'var(--accent)' }}>OS</span></b>
          <span className="chip" style={{ marginLeft: 'auto' }}>🏆 Lv {xp.level}</span>
        </div>

        {showInstall && !standalone && (
          <div className="card row install-banner" style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 24 }}>📲</span>
            <div style={{ flex: '1 1 230px' }}><b>Install HABIT OS — free app</b>
              <div className="muted small">Android, iPhone, MacBook &amp; Windows. Works offline. Your data is saved on the device.</div></div>
            {installEv
              ? <button className="btn primary" onClick={async () => { await installEv.prompt(); setInstallEv(null); setShowInstall(false) }}>Install app</button>
              : <button className="btn" onClick={() => go('settings')}>How to install</button>}
            <button className="btn small" onClick={() => { setShowInstall(false); sessionStorage.setItem('hb-install-dismissed', '1') }} aria-label="Dismiss">✕</button>
          </div>
        )}

        {page === 'dashboard' && <Dashboard go={go} />}
        {page === 'daily' && <Daily go={go} />}
        {page === 'timer' && <TimerPage />}
        {page === 'habits' && <HabitsPage />}
        {page === 'weekly' && <Weekly />}
        {page === 'monthly' && <Monthly />}
        {page === 'goals' && <GoalsPage />}
        {page === 'coach' && <AICoach />}
        {page === 'share' && <SharePage />}
        {page === 'notes' && <NotesPage />}
        {page === 'settings' && <SettingsPage />}
      </main>

      <nav className="mobile-nav" aria-label="Mobile">
        {NAV.slice(0, 5).map(n => <button key={n.id} className={page === n.id ? 'on' : ''} onClick={() => go(n.id)}><span style={{ fontSize: 17 }}>{n.icon}</span>{n.label.split(' ')[0]}</button>)}
        <button className={['monthly', 'goals', 'coach', 'share', 'notes', 'settings'].includes(page) ? 'on' : ''} onClick={() => setMenuOpen(true)}><span style={{ fontSize: 17 }}>☰</span>More</button>
      </nav>
      {toast && <div className="toast" role="status">{toast}</div>}
      {!state.profile.onboarded && <OnboardingWizard />}
    </div>
  )
}
