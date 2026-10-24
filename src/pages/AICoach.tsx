import { useEffect, useRef, useState } from 'react'
import { askAI, COACH_QUICK, localCoachAnswer } from '../lib/ai'
import { useOS } from '../lib/store'

interface Msg { role: 'user' | 'coach'; text: string }
export default function AICoach() {
  const { state, update, setToast } = useOS()
  const s = state.settings
  const hasKey = s.aiProvider !== 'none' && !!s.aiApiKey.trim()
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'coach', text: `Namaste ${s.userName || 'dost'}! 🙏 Mai tumhara Habit Coach hu.\n\nNeeche wale buttons dabao ya apna sawal likho — jaise "iss hafte kaisa gaya?" ya "aaj ka plan banao". Saare jawab tumhare REAL data se aayenge, jhooth bilkul nahi. 😊` },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, busy])
  const setS = (p: Partial<typeof s>) => update(x => ({ ...x, settings: { ...x.settings, ...p } }))

  const send = async (raw: string) => {
    const text = raw.trim(); if (!text || busy) return
    const clean = text.replace(/^[📊📋🎯🔥⏱️]\s*/u, '')
    const history = msgs
    setMsgs(m => [...m, { role: 'user', text: clean }]); setInput('')
    if (!hasKey) {
      setBusy(true)
      setTimeout(() => { setMsgs(m => [...m, { role: 'coach', text: localCoachAnswer(state, clean) }]); setBusy(false) }, 450)
      return
    }
    setBusy(true)
    try {
      const reply = await askAI(state, clean, history)
      setMsgs(m => [...m, { role: 'coach', text: reply }])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error'
      setMsgs(m => [...m, { role: 'coach', text: `⚠️ AI se jawab nahi aaya: ${msg}\n\nFikr not — Local Coach se jawab deta hu:\n\n${localCoachAnswer(state, clean)}` }])
    } finally { setBusy(false) }
  }

  return (
    <div className="grid" style={{ gap: 16, maxWidth: 820 }}>
      <header className="row spread">
        <div>
          <h1>🧠 AI Coach</h1>
          <div className="muted small">
            {hasKey ? <>✅ Asli AI ON ({s.aiProvider}) — tumhare data ke saath smart jawab</> : <>🆓 <b>Local Coach mode</b> — bina internet/key ke, tumhare data se rule-based jawab. Asli AI ke liye free key lagao 👉</>}
          </div>
        </div>
        <button className="btn" onClick={() => setShowSettings(v => !v)}>⚙️ AI settings</button>
      </header>

      {showSettings && (
        <section className="card">
          <h2>🔑 Free AI API key lagao (2 minute)</h2>
          <ol className="small" style={{ lineHeight: 1.8, paddingLeft: 18 }}>
            <li><b>Gemini (recommended, free):</b> aistudio.google.com kholo → "Get API key" → copy karo.</li>
            <li><b>Ya Groq (free, fast):</b> console.Groq.com → API Keys → create karo.</li>
            <li>Neeche provider chuno aur key paste kar do. Bas!</li>
          </ol>
          <p className="muted small">🔐 Privacy: key sirf <b>iss device</b> par save hoti hai, backup export mai key apne aap hat jati hai. AI ko sirf numbers wali summary jati hai — tumhari journal notes kabhi nahi jati.</p>
          <div className="grid g2">
            <div><label>Provider</label>
              <select value={s.aiProvider} onChange={e => setS({ aiProvider: e.target.value as typeof s.aiProvider, aiModel: '' })}>
                <option value="none">None — Local Coach only (free, offline)</option>
                <option value="Gemini">Google Gemini (free tier)</option>
                <option value="Groq">Groq — Llama (free tier)</option>
              </select></div>
            <div><label>Coach ki bhasha</label>
              <select value={s.aiLanguage} onChange={e => setS({ aiLanguage: e.target.value as typeof s.aiLanguage })}>
                <option value="hinglish">Hinglish (dost jaisa) 😎</option>
                <option value="hindi">Hindi (हिंदी)</option>
                <option value="english">English</option>
              </select></div>
          </div>
          {s.aiProvider !== 'none' && (<>
            <label>API key</label>
            <input type="password" value={s.aiApiKey} onChange={e => setS({ aiApiKey: e.target.value })} placeholder="Paste your free API key…" autoComplete="off" />
            <label>Model name (khali chhodo = best default)</label>
            <input value={s.aiModel} onChange={e => setS({ aiModel: e.target.value })} placeholder={s.aiProvider === 'Gemini' ? 'Gemini-2.5-flash' : 'llama-3.3-70b-versatile'} />
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={() => { setShowSettings(false); setToast(s.aiApiKey.trim() ? 'AI Coach ON ho gaya 🧠 Ab kuch poochho!' : 'Pehle key paste karo, phir save hoga.') }}>Save</button>
              {s.aiApiKey && <button className="btn danger" onClick={() => setS({ aiApiKey: '', aiProvider: 'none' })}>Key hatao</button>}
            </div>
          </>)}
        </section>
      )}

      <section className="card" style={{ padding: 14 }}>
        <div style={{ maxHeight: '52vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: 4 }} aria-live="polite">
          {msgs.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%',
              background: m.role === 'user' ? 'color-mix(in srgb,var(--accent) 22%,transparent)' : 'var(--bg2)',
              border: '1px solid var(--border)', borderRadius: 16, padding: '11px 14px', whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55 }}>
              {m.role === 'coach' && <div className="kicker" style={{ marginBottom: 4 }}>{hasKey ? '🧠 AI Coach' : '🤖 Local Coach'}</div>}
              {m.text}
            </div>
          ))}
          {busy && <div className="muted small" style={{ alignSelf: 'flex-start' }}>Coach soch raha hai… 💭</div>}
          <div ref={endRef} />
        </div>
        <div className="row" style={{ marginTop: 12 }} role="group" aria-label="Quick questions">
          {COACH_QUICK.map(q => <button key={q} className="btn small" disabled={busy} onClick={() => send(q)}>{q}</button>)}
        </div>
        <form className="row" style={{ marginTop: 10 }} onSubmit={e => { e.preventDefault(); send(input) }}>
          <input style={{ flex: 1, minWidth: 180 }} value={input} onChange={e => setInput(e.target.value)}
            placeholder={hasKey ? 'Coach se kuch bhi poochho…' : 'Likho: "aaj ka plan banao" / "motivate karo"…'} aria-label="Coach se sawal" />
          <button className="btn primary" disabled={busy || !input.trim()}>Bhej ➤</button>
        </form>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Sachchai wala coach: jo data hoga wahi bolega. Data nahi hai to pehle Dashboard par 1 habit complete kar ke aao 😉</p>
      </section>
    </div>
  )
}
