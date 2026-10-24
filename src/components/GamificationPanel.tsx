import { useMemo, useState } from 'react'
import { AVATARS, buddyForLevel, coins, dailyQuests, missedDaysFor, SHOP, xpAndLevel, type ShopItem } from '../lib/analytics'
import { pretty, todayKey } from '../lib/date'
import { useOS } from '../lib/store'
import { Modal } from './ui'

export default function GamificationPanel() {
  const { state, update, upsertLog, setToast } = useOS()
  const g = state.gamification
  const wallet = coins(state)
  const xp = xpAndLevel(state)
  const buddy = buddyForLevel(xp.level)
  const quests = dailyQuests(state)
  const [freezeOpen, setFreezeOpen] = useState(false)
  const [freezeHabit, setFreezeHabit] = useState(state.habits[0]?.id || '')
  const [freezeDate, setFreezeDate] = useState('')
  const missed = useMemo(() => {
    const h = state.habits.find(x => x.id === freezeHabit)
    return h ? missedDaysFor(state, h) : []
  }, [state, freezeHabit])

  const claimed = (questId: string) => g.questClaims.some(c => c.date === todayKey() && c.questId === questId)
  const claim = (questId: string, reward: number) => {
    if (claimed(questId)) return
    update(s => ({ ...s, gamification: { ...s.gamification, questClaims: [...s.gamification.questClaims, { date: todayKey(), questId, reward }] } }))
    setToast(`+${reward} coins mil gaye 🪙 Quest complete!`)
  }
  const owned = (item: ShopItem) => item.kind === 'avatar' || item.kind === 'accent' ? g.unlocked.includes(item.id) : false
  const buy = (item: ShopItem) => {
    if (owned(item)) return setToast('Ye to tumhare paas already hai 😎')
    if (wallet.balance < item.cost) return setToast(`Coins kam hai! ${item.cost - wallet.balance} aur coins chahiye — quests complete karo 🪙`)
    update(s => ({
      ...s,
      settings: item.kind === 'accent' ? { ...s.settings, accent: 'gold' as const } : s.settings,
      gamification: {
        ...s.gamification,
        spentCoins: s.gamification.spentCoins + item.cost,
        freezes: s.gamification.freezes + (item.kind === 'freeze' ? 1 : item.kind === 'freeze3' ? 3 : 0),
        unlocked: owned(item) ? s.gamification.unlocked : [...s.gamification.unlocked, item.id],
        avatar: item.kind === 'avatar' ? (AVATARS[item.id] || s.gamification.avatar) : s.gamification.avatar,
      },
    }))
    setToast(item.kind === 'accent' ? '🥇 Gold Theme lag gaya! Shaan-daar!' : item.kind === 'avatar' ? `${item.icon} Avatar set ho gaya!` : `🧊 Freeze mil gaya! Ab total ${g.freezes + (item.kind === 'freeze3' ? 3 : 1)} hai.`)
  }
  const applyFreeze = () => {
    if (g.freezes <= 0) return setToast('Freeze khali hai — pehle Shop se kharido 🧊')
    if (!freezeHabit || !freezeDate) return setToast('Pehle habit aur missed date chuno.')
    upsertLog(freezeHabit, freezeDate, 'freeze', 0, '🧊 Streak Freeze use kiya')
    update(s => ({ ...s, gamification: { ...s.gamification, freezes: Math.max(0, s.gamification.freezes - 1) } }))
    setFreezeOpen(false); setToast('🧊 Freeze lag gaya — streak safe hai! 💪')
  }
  return (
    <>
      <section className="grid g3">
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 54 }}>{buddy.emoji}</div>
          <div className="kicker">Tumhara Buddy</div>
          <b>{buddy.name}</b>
          <div className="muted small">{buddy.nextAt ? `Level ${buddy.nextAt} par evolve hoga!` : 'Final form! Legend 👑'}</div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
            {Object.entries(AVATARS).filter(([id]) => g.unlocked.includes(id)).map(([id, em]) => (
              <button key={id} className="btn small" aria-pressed={g.avatar === em} title="Avatar chuno (share card par dikhega)"
                style={{ fontSize: 19, ...(g.avatar === em ? { borderColor: 'var(--accent)' } : {}) }}
                onClick={() => update(s => ({ ...s, gamification: { ...s.gamification, avatar: em } }))}>{em}</button>))}
          </div>
          <div className="muted small">Avatar: {g.avatar} (share card par yehi dikhega)</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="kicker">🪙 Coins wallet</div>
          <div style={{ fontSize: 38, fontWeight: 900 }}>{wallet.balance}</div>
          <div className="muted small">Total kamaye {wallet.earned} · kharch {wallet.spent}<br />Complete=10 · Partial=4 · 10min focus=2 · Perfect day=20 bonus</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="kicker">🧊 Streak freeze</div>
          <div style={{ fontSize: 38, fontWeight: 900 }}>{g.freezes}</div>
          <div className="muted small">Miss hua din bachao, streak mat todo</div>
          <button className="btn primary" style={{ marginTop: 10 }} onClick={() => { setFreezeHabit(state.habits[0]?.id || ''); setFreezeDate(''); setFreezeOpen(true) }} disabled={g.freezes <= 0}>
            Freeze use karo</button>
          {g.freezes <= 0 && <div className="muted small" style={{ marginTop: 6 }}>Shop se 50 coins mai milega 👇</div>}
        </div>
      </section>

      <section>
        <h2>🎯 Aaj ke Daily Quests <span className="muted small">(roz naye 3 — complete karke Claim dabao)</span></h2>
        <div className="grid g3">
          {quests.map(q => {
            const isClaimed = claimed(q.id)
            const pct = Math.min(100, Math.round((q.progress / Math.max(1, q.target)) * 100))
            return (
              <div key={q.id} className="card" style={q.complete && !isClaimed ? { borderColor: 'var(--accent)' } : undefined}>
                <div style={{ fontSize: 27 }}>{q.icon}</div>
                <b>{q.title}</b><div className="muted small">{q.desc}</div>
                <div className="bar" style={{ margin: '10px 0 6px' }}><i style={{ width: `${pct}%` }} /></div>
                <div className="row spread">
                  <span className="small muted">{Math.min(q.progress, q.target)}/{q.target} · 🪙 {q.reward}</span>
                  {isClaimed ? <span className="chip">✅ Claimed</span>
                    : q.complete ? <button className="btn small primary" onClick={() => claim(q.id, q.reward)}>🎁 Claim +{q.reward}</button>
                    : <span className="chip">Chal raha hai…</span>}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <h2>🛒 Reward Shop <span className="muted small">(mehnat ke coins, shauk ki cheezein)</span></h2>
        <div className="grid g3">
          {SHOP.map(it => {
            const isOwned = owned(it)
            const canAfford = wallet.balance >= it.cost
            return (
              <div key={it.id} className="card">
                <div style={{ fontSize: 26 }}>{it.icon}</div>
                <b>{it.title}</b><div className="muted small">{it.desc}</div>
                <div className="row spread" style={{ marginTop: 10 }}>
                  <span className="chip">🪙 {it.cost}</span>
                  {isOwned ? <span className="chip">✅ Tumhara hai</span>
                    : <button className="btn small primary" disabled={!canAfford} onClick={() => buy(it)}>{canAfford ? 'Buy' : `${it.cost - wallet.balance} coins aur`}</button>}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {freezeOpen && (
        <Modal title="🧊 Streak Freeze use karo" onClose={() => setFreezeOpen(false)}>
          <p className="small">Jis din habit miss ho gaya tha, us din freeze laga do — wo din streak nahi todega. Tumhare paas <b>{g.freezes} freeze</b> hai.</p>
          <label>Habit</label>
          <select value={freezeHabit} onChange={e => { setFreezeHabit(e.target.value); setFreezeDate('') }}>
            {state.habits.map(h => <option key={h.id} value={h.id}>{h.icon} {h.name}</option>)}
          </select>
          <label>Missed din (pichhle 60 din ke)</label>
          {missed.length === 0 ? <p className="muted small">Is habit mai koi missed din hi nahi — champion! 🏆 Freeze bach gaya.</p>
            : <select value={freezeDate} onChange={e => setFreezeDate(e.target.value)}>
                <option value="">— Din chuno —</option>
                {missed.slice(0, 20).map(d => <option key={d} value={d}>{pretty(d)} ({d})</option>)}
              </select>}
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn primary" onClick={applyFreeze} disabled={!freezeDate}>🧊 Freeze lagao</button>
            <button className="btn" onClick={() => setFreezeOpen(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </>
  )
}
