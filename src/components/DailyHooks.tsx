import { useEffect, useMemo, useState } from 'react'
import { dailyQuests, dayStats, daysSinceKey, lastActivityKey, logFor, overallStreak, scheduledOn, vsLastWeek } from '../lib/analytics'
import { todayKey } from '../lib/date'
import { useOS } from '../lib/store'

const MOODS = [['🤩', 'Super'], ['😀', 'Khush'], ['🙂', 'Theek'], ['😐', 'Aisa hi'], ['😓', 'Thaka']] as const
export default function DailyHooks({ go }: { go: (p: string) => void }) {
  const { state, update, setToast } = useOS()
  const today = todayKey()
  const stats = dayStats(state, today)
  const streak = overallStreak(state)
  const [opened, setOpened] = useState<string>('')
  const [celeb, setCeleb] = useState(false)
  const box = state.gamification.rewardClaims.find(r => r.date === today)
  const moodToday = state.moods.find(m => m.date === today)?.mood
  const quests = dailyQuests(state)
  const claimed = (id: string) => state.gamification.questClaims.some(c => c.date === today && c.questId === id)
  const hero = quests.find(q => q.complete && !claimed(q.id)) || quests.find(q => !q.complete) || quests[0]
  const vs = vsLastWeek(state)
  const gap = daysSinceKey(lastActivityKey(state))
  const hour = new Date().getHours()
  const atRisk = hour >= 17 && stats.remaining > 0 && streak.current >= 2
  const pendingFirst = scheduledOn(state, today).find(h => logFor(state, h.id, today)?.status !== 'completed')
  const pieces = useMemo(() => Array.from({ length: 26 }, (_, i) => ({ left: (i * 37) % 100, delay: (i % 7) * 0.18, em: ['🎉', '✨', '🔥', '⭐', '🪙'][i % 5] })), [])

  useEffect(() => {
    const key = `hb-celeb-${today}`
    if (stats.total > 0 && stats.pct >= 100 && !sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1'); setCeleb(true)
      const id = setTimeout(() => setCeleb(false), 3200)
      return () => clearTimeout(id)
    }
  }, [stats.pct, stats.total, today])

  const openBox = () => {
    if (box) return
    const r = Math.random()
    let coinsAmt = 10 + Math.floor(Math.random() * 16), freeze = false, label = ''
    if (r < 0.55) label = `🪙 ${coinsAmt} coins`
    else if (r < 0.82) { coinsAmt = 30 + Math.floor(Math.random() * 21); label = `🪙 ${coinsAmt} coins — badha wala!` }
    else if (r < 0.94) { coinsAmt = 10; freeze = true; label = '🧊 Ek Streak Freeze + 10 coins!' }
    else { coinsAmt = 100; label = '💎 JACKPOT! 100 coins!' }
    update(s => ({
      ...s, gamification: {
        ...s.gamification,
        freezes: s.gamification.freezes + (freeze ? 1 : 0),
        rewardClaims: [...s.gamification.rewardClaims, { date: today, kind: 'mysteryBox' as const, coins: coinsAmt, freeze }],
      },
    }))
    setOpened(label); setToast(`🎁 Box se nikla: ${label}`)
  }
  const claimQuest = () => {
    if (!hero || claimed(hero.id) || !hero.complete) return
    update(s => ({ ...s, gamification: { ...s.gamification, questClaims: [...s.gamification.questClaims, { date: today, questId: hero.id, reward: hero.reward }] } }))
    setToast(`+${hero.reward} coins 🪙 Quest complete!`)
  }
  const quick10 = () => {
    if (!pendingFirst) return
    update(s => ({ ...s, timer: { ...s.timer, habitId: pendingFirst.id, mode: 'countdown', phase: 'focus', status: 'idle', segmentStart: null, accumulatedSec: 0, targetSec: 600, sessionStartISO: null } }))
    go('timer'); setToast('⚡ Bas 10 minute! Shuru karna hi asli jeet hai.')
  }
  const setMood = (m: string) => {
    update(s => ({ ...s, moods: [...s.moods.filter(x => x.date !== today), { date: today, mood: m }] }))
    setToast('Mood note ho gaya 💙 Apne aap ko samajhna bhi progress hai.')
  }

  return (
    <>
      {celeb && <div className="celeb" aria-hidden>{pieces.map((p, i) => <span key={i} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s` }}>{p.em}</span>)}</div>}

      {gap >= 2 && gap < 900 && (
        <div className="card row spread" style={{ borderColor: 'var(--accent2)' }}>
          <div>👋 <b>Welcome back dost!</b> <span className="muted small">{gap} din ho gaye — koi baat nahi, sabke saath hota hai. Wapas aana hi jeet hai. Aaj halka rakho: sirf ONE habit karo, bas.</span></div>
          <button className="btn primary" onClick={() => go('daily')}>Halka shuru karo</button>
        </div>
      )}
      {atRisk && (
        <div className="card row spread" role="alert" style={{ borderColor: 'var(--warn)' }}>
          <div>⚠️ <b>{streak.current} din ki streak khatre mai hai!</b> <span className="muted small">Shaam ho gayi, {stats.remaining} habit bacha hai. Full nahi to partial hi sahi — streak bachao!</span></div>
          <button className="btn primary" onClick={() => go('daily')}>Abhi karo 💪</button>
        </div>
      )}

      <section className="grid g3">
        <div className="card" style={{ textAlign: 'center', borderColor: 'color-mix(in srgb,var(--accent) 45%,transparent)' }}>
          <div className="kicker">🎁 Roz ka Mystery Box</div>
          {box || opened ? (<>
            <div style={{ fontSize: 42 }}>🎉</div>
            <b>{opened || `🪙 ${box?.coins} coins${box?.freeze ? ' + 🧊 Freeze' : ''} mile!`}</b>
            <div className="muted small">Kal phir aana — naya box milega 😄</div>
          </>) : (<>
            <div style={{ fontSize: 46 }}><span className="boxPulse">🎁</span></div>
            <b>Aaj ka box khula nahi!</b>
            <div className="muted small">Andar coins… ya shayad JACKPOT? 💎</div>
            <button className="btn primary" style={{ marginTop: 10 }} onClick={openBox}>Box kholo!</button>
          </>)}
        </div>

        <div className="card">
          <div className="kicker">🎯 Aaj ka Hero Quest</div>
          {hero ? (<>
            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 5 }}>{hero.icon} {hero.title}</div>
            <div className="muted small">{hero.desc}</div>
            <div className="bar" style={{ margin: '10px 0 6px' }}><i style={{ width: `${Math.min(100, Math.round((hero.progress / Math.max(1, hero.target)) * 100))}%` }} /></div>
            <div className="row spread"><span className="small muted">{Math.min(hero.progress, hero.target)}/{hero.target} · 🪙 {hero.reward}</span>
              {claimed(hero.id) ? <span className="chip">✅ Liya gaya</span>
                : hero.complete ? <button className="btn small primary" onClick={claimQuest}>🎁 Claim +{hero.reward}</button>
                : <button className="btn small" onClick={() => go('goals')}>Saare quests →</button>}</div>
            {pendingFirst && !hero.complete && <button className="btn small" style={{ marginTop: 10 }} onClick={quick10}>⚡ Trick: bas 10 minute "{pendingFirst.name}" shuru karo</button>}
          </>) : <p className="muted small">Habit add karo to quests aayenge.</p>}
        </div>

        <div className="card">
          <div className="kicker">🥊 Tum vs Pichhle-Hafte-Wale-Tum</div>
          <div style={{ marginTop: 10 }}>
            <div className="row spread small"><span>Iss hafta</span><b>{vs.cur}%</b></div>
            <div className="bar"><i style={{ width: `${vs.cur}%` }} /></div>
            <div className="row spread small" style={{ marginTop: 10 }}><span className="muted">Pichhla hafta</span><span>{vs.prev}%</span></div>
            <div className="bar"><i style={{ width: `${vs.prev}%`, background: '#64748b' }} /></div>
          </div>
          <p className="small" style={{ marginBottom: 0 }}>{state.logs.length === 0 ? 'Data bharna shuru karo — khud se race lagegi!' : vs.cur >= vs.prev ? 'Jeet rahe ho 😎 Aise hi rakho!' : 'Purana wala tum aage hai! Use harana hai 💪'}</p>
          <div style={{ marginTop: 12 }}>
            <div className="kicker">💙 Aaj mood kaisa hai?</div>
            <div className="row" style={{ marginTop: 6 }}>
              {MOODS.map(([em, lbl]) => <button key={em} className="btn small" title={lbl} aria-pressed={moodToday === em}
                style={{ fontSize: 18, ...(moodToday === em ? { borderColor: 'var(--accent)' } : {}) }} onClick={() => setMood(em)}>{em}</button>)}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
