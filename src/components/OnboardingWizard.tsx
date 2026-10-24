import { useState } from 'react'
import { useOS } from '../lib/store'
import type { Profile } from '../lib/types'

const PERSONAS = [
  { id: 'student', icon: '🎓', label: 'Student hu', desc: 'Padhai + skills' },
  { id: 'coder', icon: '💻', label: 'Coder / Tech', desc: 'Coding, career' },
  { id: 'creator', icon: '🎥', label: 'YouTuber / Creator', desc: 'Content + consistency' },
  { id: 'fitness', icon: '🏋️', label: 'Fitness focus', desc: 'Body banana hai' },
  { id: 'self', icon: '🌱', label: 'Khud ko improve karna hai', desc: 'All-round growth' },
]
const LEVELS = [
  { id: 'beginner', icon: '🐣', label: 'Beginner', desc: 'Halka shuru — targets aadhe (smart wala tarika!)' },
  { id: 'regular', icon: '🚶', label: 'Regular', desc: 'Normal targets' },
  { id: 'pro', icon: '🔥', label: 'Pro Mode', desc: 'Targets thode bade — full josh' },
] as const
const DAYPARTS = [
  { id: 'morning', icon: '🌅', label: 'Subah wala insan hu' },
  { id: 'afternoon', icon: '☀️', label: 'Dopahar mai free hota hu' },
  { id: 'evening', icon: '🌇', label: 'Shaam ko time milta hai' },
  { id: 'night', icon: '🦉', label: 'Raat ka ullu (night owl)' },
] as const
const PRIORITY: Record<string, string[]> = {
  creator: ['YouTube / Codenix', 'Coding'], fitness: ['Gym', 'Running'],
  coder: ['Coding', 'Cyber Security'], student: ['Coding', 'English / Self-improvement'],
  self: ['English / Self-improvement', 'Gym'],
}
export default function OnboardingWizard() {
  const { state, update, setToast } = useOS()
  const [step, setStep] = useState(1)
  const [name, setName] = useState(state.settings.userName || '')
  const [persona, setPersona] = useState(state.profile.persona || 'creator')
  const [level, setLevel] = useState<Profile['level']>(state.profile.level || 'beginner')
  const [dayPart, setDayPart] = useState<Profile['dayPart']>(state.profile.dayPart || 'morning')

  const skip = () => update(s => ({ ...s, profile: { ...s.profile, onboarded: true } }))
  const finish = () => {
    update(s => {
      const fresh = s.logs.length === 0 && s.sessions.length === 0
      const scale = level === 'beginner' ? 0.5 : level === 'pro' ? 1.25 : 1
      const startHour = { morning: 7, afternoon: 12, evening: 17, night: 20 }[dayPart]
      const pri = PRIORITY[persona] || []
      const ordered = [...s.habits].sort((a, b) => {
        const pa = pri.indexOf(a.name), pb = pri.indexOf(b.name)
        return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb) || a.order - b.order
      })
      const orderMap = new Map(ordered.map((h, i) => [h.id, i]))
      const habits = s.habits.map(h => {
        const idx = orderMap.get(h.id) ?? h.order
        const reminder = h.reminderTime || (() => {
          const mins = startHour * 60 + idx * 105
          const hh = Math.min(22, Math.floor(mins / 60)), mm = mins % 60
          return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
        })()
        return {
          ...h,
          order: fresh ? idx : h.order,
          target: fresh ? Math.max(5, Math.round((h.target * scale) / 5) * 5) : h.target,
          reminderTime: reminder,
        }
      })
      return {
        ...s, habits,
        settings: { ...s.settings, userName: name.trim() || s.settings.userName, notifications: s.settings.notifications },
        profile: { persona, level, dayPart, onboarded: true },
      }
    })
    setToast(`Welcome ${name.trim() || 'dost'}! 🎉 Tumhara personal setup taiyaar hai — ab bas roz 3 minute!`)
  }
  const Card = ({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) => (
    <button type="button" onClick={onClick} aria-pressed={on} className="card" style={{ textAlign: 'left', cursor: 'pointer', width: '100%', ...(on ? { borderColor: 'var(--accent)' } : {}) }}>{children}</button>
  )
  return (
    <div className="modal-bg" style={{ zIndex: 150 }} role="dialog" aria-modal="true" aria-label="Welcome setup">
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="row spread"><span className="kicker">Step {step}/3 · 1 minute lagega</span>
          <button className="btn small" onClick={skip}>Skip karo →</button></div>
        {step === 1 && (<>
          <h2 style={{ marginTop: 14 }}>👋 Welcome to HABIT OS!</h2>
          <p className="muted small">Pehle dost bante hai — tumhara naam aur tum ho kaun? App tumhare hisab se set hoga.</p>
          <label>Tumhara naam</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Manmohan" autoFocus />
          <label>Main zyada-tar…</label>
          <div className="grid" style={{ gap: 8 }}>
            {PERSONAS.map(p => <Card key={p.id} on={persona === p.id} onClick={() => setPersona(p.id)}><b>{p.icon} {p.label}</b> <span className="muted small">— {p.desc}</span></Card>)}
          </div>
          <button className="btn primary" style={{ marginTop: 16 }} onClick={() => setStep(2)}>Aage badho →</button>
        </>)}
        {step === 2 && (<>
          <h2 style={{ marginTop: 14 }}>💪 Tumhari taaqat kitni hai abhi?</h2>
          <p className="muted small">Sachi baat: zyadatar log bade target rakh ke haar jate hai. Smart log halka shuru karke jeette hai.</p>
          <div className="grid" style={{ gap: 8 }}>
            {LEVELS.map(l => <Card key={l.id} on={level === l.id} onClick={() => setLevel(l.id)}><b>{l.icon} {l.label}</b><div className="muted small">{l.desc}</div></Card>)}
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => setStep(1)}>← Peeche</button>
            <button className="btn primary" onClick={() => setStep(3)}>Aage badho →</button>
          </div>
        </>)}
        {step === 3 && (<>
          <h2 style={{ marginTop: 14 }}>⏰ Tumhara time kab hota hai?</h2>
          <p className="muted small">Isse har habit ka reminder time samjhdari se lag jayega. (Baad mai kabhi bhi badal sakte ho.)</p>
          <div className="grid" style={{ gap: 8 }}>
            {DAYPARTS.map(d => <Card key={d.id} on={dayPart === d.id} onClick={() => setDayPart(d.id)}><b>{d.icon} {d.label}</b></Card>)}
          </div>
          <div className="card" style={{ marginTop: 14 }}>
            <b>🎁 Shuruat ka tohfa:</b> <span className="small muted">1 🧊 Streak Freeze free + roz ek Mystery Box + Daily Quests. Roz aana, mazaa aayega!</span>
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => setStep(2)}>← Peeche</button>
            <button className="btn primary" onClick={finish}>🚀 Chalo shuru karein!</button>
          </div>
        </>)}
      </div>
    </div>
  )
}
