import { coins, dayStats, focusMinutesBetween, habitStreak, logFor, overallStreak, xpAndLevel } from './analytics'
import { fmtMinutes, pretty, todayKey, weekKeys } from './date'
import type { AppState } from './types'

export type CardType = 'today' | 'week' | 'streak'
const ACCENT_HEX: Record<string, string> = { green: '#22ff88', cyan: '#22d3ee', violet: '#a78bfa', gold: '#ffd34d' }

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}
/** Draws a 1080×1350 (Instagram/WhatsApp friendly) share card and returns a PNG blob. Pure canvas — free, offline. */
export async function makeShareCard(state: AppState, type: CardType): Promise<Blob> {
  const W = 1080, H = 1350
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const ctx = cv.getContext('2d')!
  const accent = ACCENT_HEX[state.settings.accent] || '#22ff88'
  const today = todayKey()
  const xp = xpAndLevel(state); const streak = overallStreak(state); const c = coins(state)
  // background
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#07090c'); g.addColorStop(0.6, '#0a1410'); g.addColorStop(1, '#071018')
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.85, H * 0.05, 40, W * 0.85, H * 0.05, 620)
  glow.addColorStop(0, accent + '44'); glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = accent; ctx.lineWidth = 3; rr(ctx, 26, 26, W - 52, H - 52, 44); ctx.stroke()

  ctx.textAlign = 'center'; ctx.fillStyle = '#eef2f0'
  ctx.font = '900 62px system-ui, sans-serif'
  ctx.fillText('HABIT OS', W / 2, 128)
  ctx.fillStyle = '#94a39b'; ctx.font = '700 27px system-ui, sans-serif'
  ctx.fillText('P E R S O N A L   P R O G R E S S   S Y S T E M', W / 2, 172)
  ctx.font = '90px system-ui'; ctx.fillText(state.gamification.avatar, W / 2, 290)
  ctx.fillStyle = '#eef2f0'; ctx.font = '800 40px system-ui, sans-serif'
  ctx.fillText(state.settings.userName || 'My Journey', W / 2, 352)
  ctx.fillStyle = '#94a39b'; ctx.font = '600 30px system-ui, sans-serif'
  ctx.fillText(pretty(today), W / 2, 396)

  if (type === 'today') {
    const s = dayStats(state, today)
    // ring
    const cx = W / 2, cy = 620, r = 150
    ctx.lineWidth = 30; ctx.strokeStyle = '#16241c'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = accent; ctx.lineCap = 'round'; ctx.beginPath()
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * s.pct) / 100); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = '900 96px system-ui'; ctx.fillText(`${s.pct}%`, cx, cy + 34)
    ctx.font = '600 30px system-ui'; ctx.fillStyle = '#94a39b'; ctx.fillText("TODAY'S PROGRESS", cx, cy + 84)
    ctx.textAlign = 'left'
    let y = 890
    for (const h of state.habits.filter(x => !x.paused).slice(0, 5)) {
      const l = logFor(state, h.id, today)
      const mark = l?.status === 'completed' ? '✅' : l?.status === 'partial' ? '🟡' : '⬜'
      ctx.font = '40px system-ui'; ctx.fillStyle = '#eef2f0'
      ctx.fillText(`${mark}  ${h.name}`, 140, y)
      ctx.textAlign = 'right'; ctx.fillStyle = '#94a39b'; ctx.font = '600 32px system-ui'
      ctx.fillText(`${h.target} ${h.unit}`, W - 140, y); ctx.textAlign = 'left'
      y += 66
    }
  } else if (type === 'week') {
    const wk = weekKeys(today, state.settings.weekStart)
    const avg = Math.round(wk.reduce((a, k) => a + dayStats(state, k).pct, 0) / 7)
    ctx.font = '900 130px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText(`${avg}%`, W / 2, 560)
    ctx.font = '600 32px system-ui'; ctx.fillStyle = '#94a39b'; ctx.fillText('THIS WEEK AVERAGE', W / 2, 612)
    const base = 950, bw = 92, gap = 30, x0 = (W - (bw * 7 + gap * 6)) / 2
    wk.forEach((k, i) => {
      const pct = dayStats(state, k).pct; const bh = Math.max(8, (pct / 100) * 250)
      ctx.fillStyle = k === today ? accent : '#2b4a3a'
      rr(ctx, x0 + i * (bw + gap), base - bh, bw, bh, 14); ctx.fill()
      ctx.fillStyle = '#94a39b'; ctx.font = '700 26px system-ui'
      ctx.fillText(pretty(k).split(' ')[0], x0 + i * (bw + gap) + bw / 2, base + 42)
    })
    ctx.fillStyle = '#eef2f0'; ctx.font = '800 44px system-ui'
    ctx.fillText(`⏱️ Focus this week: ${fmtMinutes(focusMinutesBetween(state, wk))}`, W / 2, 1075)
  } else {
    const best = state.habits.map(h => ({ h, s: habitStreak(state, h) })).sort((a, b) => b.s.current - a.s.current)[0]
    ctx.font = '150px system-ui'; ctx.fillText('🔥', W / 2, 580)
    ctx.font = '900 150px system-ui'; ctx.fillStyle = '#fff'
    ctx.fillText(`${best ? best.s.current : streak.current}`, W / 2, 730)
    ctx.font = '800 46px system-ui'; ctx.fillStyle = accent; ctx.fillText('DAY STREAK!', W / 2, 792)
    ctx.font = '600 36px system-ui'; ctx.fillStyle = '#cfe6da'
    ctx.fillText(best ? `${best.h.icon} ${best.h.name} — har roz, bina ruke` : 'Roz thoda-thoda, jeet pakki', W / 2, 860)
    ctx.font = '600 32px system-ui'; ctx.fillStyle = '#94a39b'
    ctx.fillText(`Longest ever: ${best ? best.s.longest : streak.longest} days`, W / 2, 920)
  }

  // footer stats strip
  const fy = 1135
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; rr(ctx, 80, fy - 64, W - 160, 120, 28); ctx.fill()
  ctx.fillStyle = '#eef2f0'; ctx.font = '800 36px system-ui'
  ctx.fillText(`🏆 Lv ${xp.level}   🔥 ${streak.current}d   🪙 ${c.balance}   ⏱️ ${fmtMinutes(xp.focusMin)}`, W / 2, fy + 12)
  ctx.font = '700 34px system-ui'; ctx.fillStyle = accent
  ctx.fillText(state.settings.socialHandle || '@Codenix', W / 2, 1265)
  ctx.fillStyle = '#5f7268'; ctx.font = '600 24px system-ui'
  ctx.fillText('Tracked with HABIT OS — free forever', W / 2, 1305)

  return new Promise((resolve, reject) => cv.toBlob(b => b ? resolve(b) : reject(new Error('Card could not be created')), 'image/png'))
}
export function shareCaption(state: AppState, type: CardType): string {
  const today = todayKey(); const streak = overallStreak(state)
  const base = type === 'today' ? `Aaj ka progress: ${dayStats(state, today).pct}% done ✅`
    : type === 'week' ? `Iss hafte ka hisaab 📊 consistency hi superpower hai!`
    : `🔥 ${streak.current} din ki streak! Rukna mana hai.`
  return `${base}\n\nRoz thoda-thoda, jeet pakki 💪\nTracked with HABIT OS ${state.settings.socialHandle || ''}\n\n#habits #discipline #selfimprovement #coding #fitness #consistency #HabitOS`
}
