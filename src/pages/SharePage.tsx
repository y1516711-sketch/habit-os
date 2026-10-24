import { useCallback, useEffect, useRef, useState } from 'react'
import { todayKey } from '../lib/date'
import { makeShareCard, shareCaption, type CardType } from '../lib/shareCard'
import { useOS } from '../lib/store'

export default function SharePage() {
  const { state, update, setToast } = useOS()
  const [type, setType] = useState<CardType>('today')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const blobRef = useRef<Blob | null>(null)
  const caption = shareCaption(state, type)

  const generate = useCallback(async (t: CardType) => {
    setBusy(true)
    try {
      const blob = await makeShareCard(state, t)
      blobRef.current = blob
      setUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob) })
    } catch { setToast('Card ban nahi paya — dobara try karo.') }
    finally { setBusy(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.habits, state.logs, state.sessions, state.settings.accent, state.settings.userName, state.settings.socialHandle, state.gamification.avatar])

  useEffect(() => { generate(type) }, [type, generate])

  const fileName = `habit-os-${type}-${todayKey()}.png`
  const downloadCard = () => {
    if (!url) return
    const a = document.createElement('a'); a.href = url; a.download = fileName; a.click()
    setToast('Card download ho gaya 📸 Ab WhatsApp/Insta par daal do!')
  }
  const shareNow = async () => {
    const blob = blobRef.current
    try {
      if (blob && navigator.canShare) {
        const file = new File([blob], fileName, { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], text: caption, title: 'My HABIT OS progress' })
          return
        }
      }
      if (navigator.share) { await navigator.share({ text: caption, title: 'My HABIT OS progress' }); downloadCard(); return }
      downloadCard()
    } catch { /* user cancelled share — no noise */ }
  }
  const copyCaption = async () => {
    try { await navigator.clipboard.writeText(caption); setToast('Caption copy ho gaya ✍️ Paste kar do!') }
    catch { setToast('Copy nahi ho paya — caption manually select kar lo.') }
  }
  return (
    <div className="grid" style={{ gap: 18 }}>
      <header>
        <h1>📸 Share Card</h1>
        <div className="muted">Apni progress ki sundar photo banao — WhatsApp, Instagram, YouTube Community ke liye ready. Data 100% tumhara real wala.</div>
      </header>
      <div className="row" role="group" aria-label="Card type">
        {([['today', '✅ Aaj ki progress'], ['week', '📊 Iss hafta'], ['streak', '🔥 Streak']] as [CardType, string][]).map(([t, lbl]) => (
          <button key={t} className="btn" aria-pressed={type === t}
            style={type === t ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => setType(t)}>{lbl}</button>
        ))}
      </div>
      <section className="grid g2" style={{ alignItems: 'start' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          {busy && !url ? <p className="muted">Card ban raha hai… 🎨</p>
            : url && <img src={url} alt="Share card ka preview" style={{ width: '100%', maxWidth: 380, borderRadius: 18, border: '1px solid var(--border)' }} />}
          <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
            <button className="btn primary" onClick={shareNow} disabled={!url}>📤 Share karo</button>
            <button className="btn" onClick={downloadCard} disabled={!url}>📥 PNG download</button>
            <button className="btn" onClick={() => generate(type)} disabled={busy}>🔄 Refresh</button>
          </div>
          <p className="muted small">1080×1350 PNG banti hai — Insta post ke liye perfect size.</p>
        </div>
        <div className="grid" style={{ gap: 14 }}>
          <div className="card">
            <h2>✍️ Ready-made caption</h2>
            <textarea rows={7} value={caption} readOnly aria-label="Share caption" />
            <button className="btn" style={{ marginTop: 10 }} onClick={copyCaption}>Caption copy karo</button>
          </div>
          <div className="card">
            <h2>🏷️ Card par naam</h2>
            <label>Tumhara handle (card ke neeche dikhega)</label>
            <input value={state.settings.socialHandle} onChange={e => update(s => ({ ...s, settings: { ...s.settings, socialHandle: e.target.value } }))}
              placeholder="@Codenix" />
            <label>Display naam</label>
            <input value={state.settings.userName} onChange={e => update(s => ({ ...s, settings: { ...s.settings, userName: e.target.value } }))} placeholder="e.g. Lakshya" />
            <p className="muted small">Avatar aur theme color Goals page ke Shop se badal sakte ho — card apne aap update ho jayega.</p>
          </div>
          <div className="card">
            <h2>💡 Sharing tips</h2>
            <ul className="small" style={{ lineHeight: 1.8, paddingLeft: 18 }}>
              <li><b>Roz ka ritual:</b> din khatm hone par "Aaj ki progress" card share karo — accountability banti hai.</li>
              <li><b>Streak milestones</b> (7, 30, 100 din) par Streak card sabse zyada asar karta hai 🔥</li>
              <li>YouTube Community post mai card + caption = ready content, 1 minute mai.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
