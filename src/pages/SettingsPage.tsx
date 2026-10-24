import { useRef, useState } from 'react'
import { download, Modal, toCSV } from '../components/ui'
import { validateImported } from '../lib/db'
import { todayKey } from '../lib/date'
import { isNativeApp, requestNativeReminderPermissions } from '../lib/native'
import { useOS } from '../lib/store'

export default function SettingsPage() {
  const { state, update, resetAll, loadDemo, replaceState, setToast } = useOS()
  const s = state.settings
  const [confirmReset, setConfirmReset] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [importErr, setImportErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const setS = (p: Partial<typeof s>) => update(x => ({ ...x, settings: { ...x.settings, ...p } }))

  const enableNotifications = async () => {
    if (isNativeApp()) {
      try {
        const permission = await requestNativeReminderPermissions()
        if (!permission.notifications) return setToast('Notifications allow nahi hui — Android app settings me HABIT OS notifications on karo.')
        setS({ notifications: true })
        setToast(permission.exactAlarms
          ? 'Notifications aur exact alarm dono on 🔔⏰'
          : 'Notifications on 🔔 Exact alarm permission allow karoge to reminder zyada time par aayega.')
      } catch { setToast('Permission settings nahi khul paayi — Android settings me HABIT OS notifications allow karo.') }
      return
    }
    if (!('Notification' in window)) return setToast('This browser does not support notifications.')
    const perm = await Notification.requestPermission()
    if (perm === 'granted') { setS({ notifications: true }); new Notification('🔔 HABIT OS reminders on', { body: 'You will be reminded at each habit’s reminder time while the app or browser is open.' }); setToast('Notifications enabled 🔔') }
    else setToast('Permission not granted — reminders stay off. You can allow it in browser site settings.')
  }
  const exportAllJSON = () => { const safe = { ...state, settings: { ...state.settings, aiApiKey: '' } }; download(`habit-os-backup-${todayKey()}.json`, JSON.stringify(safe, null, 2)); setToast('Full backup exported 📥 (AI API key suraksha ke liye backup se hata di gayi hai)') }
  const exportAllCSV = () => {
    const rows = [['Type', 'Date', 'Habit', 'Status/Mode', 'Value/DurationSec', 'Note']]
    const nameOf = (id: string) => state.habits.find(h => h.id === id)?.name || id
    state.logs.forEach(l => rows.push(['log', l.date, nameOf(l.habitId), l.status, String(l.value), l.note]))
    state.sessions.forEach(x => rows.push(['session', x.start, nameOf(x.habitId), x.mode, String(x.durationSec), x.note]))
    download(`habit-os-data-${todayKey()}.csv`, toCSV(rows), 'text/csv'); setToast('CSV exported 📥')
  }
  const doImport = async (file: File) => {
    setImportErr('')
    try {
      const text = await file.text()
      let parsed: unknown
      try { parsed = JSON.parse(text) } catch { setImportErr('Invalid file: this is not valid JSON. Choose a HABIT OS backup .json file.'); return }
      const v = validateImported(parsed)
      if (!v.ok || !v.state) { setImportErr(`Import failed: ${v.error}`); return }
      if (!confirm('Restore this backup? It REPLACES all current data on this device.')) return
      replaceState(v.state); setToast('Backup restored successfully ✅')
    } catch { setImportErr('Could not read that file. Please try again.') }
  }

  return (
    <div className="grid" style={{ gap: 18, maxWidth: 820 }}>
      <header><h1>⚙️ Settings &amp; Backup</h1>
        <div className="muted">100% free · data lives on this device in IndexedDB · no account, no paid cloud, no tracking.</div></header>

      <section className="card"><h2>👤 Profile &amp; appearance</h2>
        <label>Your name (shown on Dashboard)</label>
        <input value={s.userName} onChange={e => setS({ userName: e.target.value })} placeholder="e.g. Manmohan" />
        <div className="grid g3">
          <div><label>Theme</label><select value={s.theme} onChange={e => setS({ theme: e.target.value as typeof s.theme })}><option value="dark">🌙 Dark</option><option value="light">☀️ Light</option></select></div>
          <div><label>Accent</label><select value={s.accent} onChange={e => setS({ accent: e.target.value as typeof s.accent })}><option value="green">Neon green</option><option value="cyan">Cyan</option><option value="violet">Violet</option>{state.gamification.unlocked.includes('accent-gold') && <option value="gold">🥇 Gold (Shop)</option>}</select></div>
          <div><label>Week starts</label><select value={s.weekStart} onChange={e => setS({ weekStart: e.target.value as typeof s.weekStart })}><option>Monday</option><option>Sunday</option></select></div>
        </div>
        <label>XP per completed habit</label>
        <input type="number" min={1} max={500} style={{ maxWidth: 160 }} value={s.xpPerCompletion} onChange={e => setS({ xpPerCompletion: Math.max(1, Number(e.target.value) || 1) })} />
        <div className="row" style={{ marginTop: 14 }}>
          <span className="small muted">Profile: <b style={{ color: 'var(--text)' }}>{state.profile.persona || '—'}</b> · {state.profile.level} · {state.profile.dayPart}</span>
          <button className="btn small" onClick={() => { update(x => ({ ...x, profile: { ...x.profile, onboarded: false } })); setToast('Setup wizard khul gaya 🪄') }}>🪄 Personal setup dobara karo</button>
        </div>
      </section>

      <section className="card"><h2>⏱️ Timer &amp; Pomodoro</h2>
        <div className="grid g3">
          <div><label>Pomodoro focus (min)</label><input type="number" min={1} max={240} value={s.pomodoroFocusMin} onChange={e => setS({ pomodoroFocusMin: Math.max(1, Number(e.target.value) || 25) })} /></div>
          <div><label>Pomodoro break (min)</label><input type="number" min={1} max={120} value={s.pomodoroBreakMin} onChange={e => setS({ pomodoroBreakMin: Math.max(1, Number(e.target.value) || 5) })} /></div>
          <div><label>Default countdown (min)</label><input type="number" min={1} max={480} value={s.countdownDefaultMin} onChange={e => setS({ countdownDefaultMin: Math.max(1, Number(e.target.value) || 30) })} /></div>
        </div>
      </section>

      <section className="card"><h2>🔔 Reminders</h2>
        <p className="small">Set a reminder time on each habit (Habits → Edit), then allow notifications. Android uses local reminders; web reminders need HABIT OS or the browser to be open.</p>
        <div className="row">
          {!s.notifications
            ? <button className="btn primary" onClick={enableNotifications}>{isNativeApp() ? 'Enable notifications + alarm' : 'Enable browser notifications'}</button>
            : <><span className="chip">✅ Notifications on</span>{isNativeApp() && <button className="btn" onClick={enableNotifications}>Check alarm permission</button>}<button className="btn" onClick={() => setS({ notifications: false })}>Turn off</button></>}
        </div>
        <p className="muted small">⚠️ Honest browser limitation: web apps cannot guarantee alarms when the browser/app is fully closed and the device kills background pages. Reminders fire reliably while HABIT OS (or the browser) is open. For critical alarms, also keep a phone alarm. No paid push service is used.</p>
      </section>

      <section className="card"><h2>🏷️ Habit categories</h2>
        <div className="row">{state.categories.map(c => (
          <span key={c} className="chip">{c} <button aria-label={`Remove ${c}`} style={{ background: 'none', border: 0, color: 'inherit' }}
            onClick={() => update(x => ({ ...x, categories: x.categories.filter(y => y !== c) }))}>✕</button></span>))}</div>
        <div className="row" style={{ marginTop: 10 }}>
          <input style={{ flex: 1, minWidth: 160 }} value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="New category name" />
          <button className="btn" onClick={() => { const v = newCat.trim(); if (!v) return; if (state.categories.includes(v)) return setToast('That category already exists.'); update(x => ({ ...x, categories: [...x.categories, v] })); setNewCat('') }}>Add</button>
        </div>
      </section>

      <section className="card"><h2>💾 Backup, restore &amp; export</h2>
        <p className="small muted">Your data is saved automatically on this device (IndexedDB). Export regularly — a backup file lets you move to a new phone/MacBook for free.</p>
        <div className="row">
          <button className="btn primary" onClick={exportAllJSON}>📥 Full backup (JSON)</button>
          <button className="btn" onClick={exportAllCSV}>📥 All data (CSV)</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>📤 Restore backup…</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }} />
        </div>
        {importErr && <div className="card" style={{ borderColor: 'var(--danger)', padding: 10, marginTop: 10 }} role="alert">⚠️ {importErr}</div>}
        <p className="muted small">Stats: {state.habits.length} habits · {state.logs.length} logs · {state.sessions.length} sessions · {state.notes.length} notes{state.demo ? ' · 🧪 demo data present' : ''}</p>
      </section>

      <section className="card"><h2>🧪 Demo &amp; danger zone</h2>
        <div className="row">
          <button className="btn" onClick={() => { loadDemo(); setToast('Demo data loaded (last 35 days) — clearly labelled, reset anytime.') }}>Load demo data</button>
          <button className="btn danger" onClick={() => setConfirmReset(true)}>🗑️ Reset all data</button>
        </div>
        <p className="muted small">Demo data is optional and only fills the last 35 days so you can explore reports. Reset restores the 6 editable sample habits with an empty history.</p>
      </section>

      <section className="card"><h2>📲 Install this app (free, all devices)</h2>
        <ul className="small" style={{ lineHeight: 1.7, paddingLeft: 18 }}>
          <li><b>Android (Chrome):</b> menu ⋮ → “Install app” / “Add to Home screen”.</li>
          <li><b>iPhone/iPad (Safari):</b> Share → “Add to Home Screen”.</li>
          <li><b>MacBook (Safari):</b> File → “Add to Dock”. <b>Chrome/Edge (Mac &amp; Windows):</b> install icon in the address bar.</li>
          <li>Works offline after first load. Each device keeps its own data — move data with the JSON backup above.</li>
          <li><b>🤖 Asli Android app:</b> ready APK project ke <code>releases/</code> folder mai hai — phone par direct install karo, app band ho tab bhi reminders aayenge! Pura guide: <code>ANDROID.md</code></li>
          <li><b>Publish free forever:</b> run <code>npm run build</code> and drag the <code>dist/</code> folder onto Netlify Drop / Vercel / GitHub Pages (all have free tiers). Cost: ₹0.</li>
        </ul>
      </section>

      {confirmReset && (
        <Modal title="Reset all data?" onClose={() => setConfirmReset(false)}>
          <p>This deletes <b>all</b> habits, logs, sessions, goals and notes on this device and restores the sample defaults. Export a backup first if you might want this data back.</p>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn danger" onClick={async () => { await resetAll(); setConfirmReset(false); setToast('All data reset. Fresh start 🌱') }}>Yes, reset everything</button>
            <button className="btn" onClick={() => setConfirmReset(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
