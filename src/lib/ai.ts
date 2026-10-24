import { achievements, coins, dayStats, focusMinutesBetween, habitStreak, isScheduled, logFor, overallStreak, xpAndLevel } from './analytics'
import { addDays, fmtMinutes, monthKeys, pretty, todayKey, weekKeys } from './date'
import type { AppState } from './types'

/** Compact, privacy-safe summary sent to the AI (numbers + habit names only — journal text is NEVER sent). */
export function buildCoachContext(state: AppState): string {
  const today = todayKey(); const now = new Date()
  const wk = weekKeys(today, state.settings.weekStart)
  const mk = monthKeys(now.getFullYear(), now.getMonth())
  const xp = xpAndLevel(state); const streak = overallStreak(state); const c = coins(state)
  const lines: string[] = [
    `User: ${state.settings.userName || 'the user'}. Today: ${pretty(today)}.`,
    `Level ${xp.level} (${xp.xp} XP), coins ${c.balance}, overall streak ${streak.current} days (best ${streak.longest}).`,
    `Today so far: ${dayStats(state, today).pct}% complete. Week avg: ${Math.round(wk.reduce((a, k) => a + dayStats(state, k).pct, 0) / 7)}%. Focus this week: ${fmtMinutes(focusMinutesBetween(state, wk))}, this month: ${fmtMinutes(focusMinutesBetween(state, mk))}.`,
    'Habits (name | last-14-days rate | streak | today):',
  ]
  for (const h of state.habits.filter(x => !x.paused)) {
    let done = 0, sched = 0
    for (let i = 0; i < 14; i++) { const k = addDays(today, -i); if (!isScheduled(h, k)) continue; const l = logFor(state, h.id, k); if (l?.status === 'rest' || l?.status === 'freeze') continue; sched++; if (l?.status === 'completed') done++; else if (l?.status === 'partial') done += 0.5 }
    lines.push(`- ${h.name} (target ${h.target} ${h.unit}) | ${sched ? Math.round((done / sched) * 100) : 0}% | streak ${habitStreak(state, h).current}d | today: ${logFor(state, h.id, today)?.status || 'not done yet'}`)
  }
  lines.push(`Badges unlocked: ${achievements(state).filter(a => a.unlocked).length}/9. Total sessions: ${state.sessions.length}.`)
  return lines.join('\n')
}

const langName = (l: AppState['settings']['aiLanguage']) =>
  l === 'english' ? 'English' : l === 'hindi' ? 'Hindi (Devanagari script)' : 'Hinglish (Hindi+English mix in Roman script, friendly dost jaisa tone)'

export async function askAI(state: AppState, userPrompt: string, history: { role: 'user' | 'coach'; text: string }[]): Promise<string> {
  const { aiProvider, aiApiKey, aiModel, aiLanguage } = state.settings
  if (aiProvider === 'none' || !aiApiKey.trim()) throw new Error('NO_KEY')
  const system = `You are the AI Coach inside HABIT OS, a personal habit tracker. Reply in ${langName(aiLanguage)}. Be practical, specific and encouraging — short paragraphs or small bullet lists, max ~220 words unless asked for a full plan. Only use the DATA below; never invent numbers or history that is not in it. If data is empty, motivate the first small step.\n\nUSER DATA:\n${buildCoachContext(state)}`
  if (aiProvider === 'Gemini') {
    const model = aiModel.trim() || 'Gemini-2.5-flash'
    const contents = [
      { role: 'user', parts: [{ text: system }] },
      ...history.slice(-6).map(h => ({ role: h.role === 'coach' ? 'model' : 'user', parts: [{ text: h.text }] })),
      { role: 'user', parts: [{ text: userPrompt }] },
    ]
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(aiApiKey.trim())}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error?.message || `Gemini error (${res.status}). Check API key/model name.`)
    const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || ''
    if (!text) throw new Error('AI ne empty reply diya. Dobara try karo.')
    return text
  }
  // Groq (OpenAI-compatible, free tier)
  const model = aiModel.trim() || 'llama-3.3-70b-versatile'
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${aiApiKey.trim()}` },
    body: JSON.stringify({
      model, temperature: 0.7, max_tokens: 700,
      messages: [{ role: 'system', content: system }, ...history.slice(-6).map(h => ({ role: h.role === 'coach' ? 'assistant' : 'user', content: h.text })), { role: 'user', content: userPrompt }],
    }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error?.message || `Groq error (${res.status}). Check API key/model name.`)
  const text = data?.choices?.[0]?.message?.content || ''
  if (!text) throw new Error('AI ne empty reply diya. Dobara try karo.')
  return text
}

/** Offline Local Coach — rule based answers from real data. No API, no internet, ₹0. Supports EN + Hinglish keywords. */
export function localCoachAnswer(state: AppState, qRaw: string): string {
  const q = qRaw.toLowerCase()
  const today = todayKey()
  const has = (...words: string[]) => words.some(w => q.includes(w))
  const stats = state.habits.filter(h => !h.paused).map(h => {
    let done = 0, sched = 0
    for (let i = 0; i < 14; i++) { const k = addDays(today, -i); if (!isScheduled(h, k)) continue; const l = logFor(state, h.id, k); if (l?.status === 'rest' || l?.status === 'freeze') continue; sched++; if (l?.status === 'completed') done++; else if (l?.status === 'partial') done += 0.5 }
    return { h, rate: sched ? done / sched : 0, sched, streak: habitStreak(state, h) }
  }).filter(x => x.sched > 0).sort((a, b) => b.rate - a.rate)

  if (state.logs.length === 0 && state.sessions.length === 0) {
    return `Dost, abhi tumhara data khali hai — coach jhooth nahi bolega! 😄\n\nPehla step: Dashboard par jao, ONE habit tick karo ya 25-min ka ek Pomodoro lagao. Phir mujhse poochho "mera week kaisa gaya?" — mai tumhare REAL data se jawab dunga.\n\nChhota shuru karo: aaj sirf sabse easy habit pura karo. Bas. 💪`
  }
  if (has('plan', 'aaj kya', 'today', 'schedule', 'routine')) {
    const pending = state.habits.filter(h => !h.paused && isScheduled(h, today) && !['completed'].includes(logFor(state, h.id, today)?.status || ''))
    if (!pending.length) return `Aaj ka kaam ho gaya champ! 🏆 Saare scheduled habits complete hai. Ab rest karo ya kal ki planning kar lo — journal mai 2-line likhna bonus quest bhi dega 📓`
    const list = pending.map((h, i) => `${i + 1}. ${h.icon} ${h.name} — ${h.target} ${h.unit}${h.reminderTime ? ` (⏰ ${h.reminderTime})` : ''}`).join('\n')
    return `📋 Aaj ka plan (jo bacha hai):\n${list}\n\nMera suggestion: sabse mushkil wala PEHLE karo, jab energy fresh hai. Har ek ke liye Timer use karo — focus time bhi save hoga, coins bhi milenge 🪙. Ek-ek karke, pressure nahi!`
  }
  if (has('kamzor', 'weak', 'worst', 'improve', 'problem', 'miss')) {
    const w = stats[stats.length - 1]
    if (!w) return 'Abhi kisi habit ka 14-din ka data nahi hai. Kuch din log karo, phir mai weakest habit pakka bata dunga — data se, guess se nahi.'
    return `🎯 Tumhari sabse kamzor habit (last 14 din): **${w.h.icon} ${w.h.name}** — sirf ${Math.round(w.rate * 100)}%.\n\n3 tried-and-tested fixes:\n1. Target aadha kar do kuch din (${w.h.target} → ${Math.max(1, Math.round(w.h.target / 2))} ${w.h.unit}) — chhota jeet, bada momentum.\n2. Time fix karo — reminder set karo uss time par jab tum free hote ho.\n3. Ise kisi strong habit ke just baad rakho (habit stacking).\n\nEk din miss ho jaye to 🧊 Streak Freeze hai hi — haar mat maano!`
  }
  if (has('best', 'strong', 'accha', 'top')) {
    const b = stats[0]
    if (!b) return 'Abhi best habit bolne layak data nahi hai. Kuch din track karo!'
    return `⭐ Tumhari star habit: **${b.h.icon} ${b.h.name}** — last 14 din mai ${Math.round(b.rate * 100)}%, streak 🔥 ${b.streak.current} din!\n\nJo cheez iske liye kaam kar rahi hai (time, jagah, mood) — wahi formula baaki habits par copy karo. Yehi toppers wala secret hai. 😎`
  }
  if (has('streak', 'chain')) {
    const o = overallStreak(state)
    const best = stats.reduce((m, x) => x.streak.current > (m?.streak.current ?? -1) ? x : m, stats[0])
    return `🔥 Overall streak: **${o.current} din** (best kabhi: ${o.longest} din).${best ? `\nSabse lambi current chain: ${best.h.icon} ${best.h.name} — ${best.streak.current} din.` : ''}\n\nRule yaad rakho: "Never miss twice." Ek din gaya to koi baat nahi — dusre din wapas aao, ya 🧊 freeze laga do. Chain todna galti nahi, wapas na aana galti hai.`
  }
  if (has('focus', 'time', 'ghante', 'hours', 'timer')) {
    const wk = weekKeys(today, state.settings.weekStart); const now = new Date(); const mk = monthKeys(now.getFullYear(), now.getMonth())
    return `⏱️ Tumhara focus time (timer se):\n• Iss hafte: **${fmtMinutes(focusMinutesBetween(state, wk))}**\n• Iss mahine: **${fmtMinutes(focusMinutesBetween(state, mk))}**\n• Total sessions: ${state.sessions.length}\n\nTip: roz ka "ek Pomodoro to pakka" rule bana lo. 25 minute chhota lagta hai, par mahine mai 12+ ghante ban jate hai!`
  }
  if (has('week', 'hafta', 'hafte', 'summary', 'report', 'kaisa gaya', 'performance', 'mahina', 'month')) {
    const wk = weekKeys(today, state.settings.weekStart)
    const avgPct = Math.round(wk.reduce((a, k) => a + dayStats(state, k).pct, 0) / 7)
    const prev = wk.map(k => addDays(k, -7)); const prevAvg = Math.round(prev.reduce((a, k) => a + dayStats(state, k).pct, 0) / 7)
    const best = stats[0], weak = stats[stats.length - 1]
    return `📊 Iss hafte ka sach (bina jhooth):\n• Average completion: **${avgPct}%** (pichhla hafta ${prevAvg}% — ${avgPct >= prevAvg ? 'upar ja rahe ho ▲' : 'thoda neeche ▼, wapas aana hai'})\n• Focus: ${fmtMinutes(focusMinutesBetween(state, wk))}\n${best ? `• Best: ${best.h.name} (${Math.round(best.rate * 100)}%)\n` : ''}${weak && weak !== best ? `• Dhyaan chahiye: ${weak.h.name} (${Math.round(weak.rate * 100)}%)\n` : ''}\nFull charts ke liye Weekly Report page dekho. Agla goal: pichhle hafte ko bas thoda sa beat karna hai. Bas thoda sa. 💪`
  }
  if (has('motivat', 'give up', 'haar', 'bore', 'mann nahi', 'lazy', 'aalsi', 'thak')) {
    const done = state.logs.filter(l => l.status === 'completed').length
    return `Sun dost ❤️ — mann na karna NORMAL hai. Champions bhi thakte hai, farak sirf itna hai: wo thake hue bhi 10 minute kar lete hai.\n\nTum ab tak **${done} habits complete** kar chuke ho. Ye woh insan nahi jo haar maanta hai.\n\nAaj ka sirf ek kaam: sabse chhoti habit ka AADHA kar do. Partial bhi chalega — 0 se to bada hai. Chalo, timer lagao, mai yahi hu! 🔥`
  }
  if (has('coin', 'xp', 'level', 'quest', 'freeze', 'shop', 'game')) {
    const c = coins(state); const xp = xpAndLevel(state)
    return `🎮 Game status:\n• Level ${xp.level} (${xp.xp} XP) — next level ke liye ${xp.toNext} XP\n• Coins: 🪙 ${c.balance} (total kamaye ${c.earned})\n• Streak Freeze: 🧊 ${state.gamification.freezes}\n\nCoins kamane ka tarika: habit complete = 10, partial = 4, har 10-min focus = 2, perfect day = 20 bonus, daily quests = 10–40!\n\nCoins se Shop (Goals page) mai Freeze, avatars aur Gold Theme milega. Quest complete karke "Claim" dabana mat bhoolna!`
  }
  if (has('hello', 'hi', 'hey', 'namaste', 'kaise ho')) {
    return `Namaste ${state.settings.userName || 'dost'}! 🙏 Mai tumhara Coach hu.\n\nMujhse ye poochh sakte ho:\n• "Iss hafte kaisa gaya?"\n• "Aaj ka plan banao"\n• "Meri kamzor habit kaunsi hai?"\n• "Focus time kitna hai?"\n• "Motivate karo"\n\n(Sab jawab tumhare REAL data se. Asli AI ke liye upar free API key lagao — 2 minute lagega.)`
  }
  return `Good sawal! 👍 Local Coach mode mai mai tumhare data par ye bata sakta hu:\n\n• "Iss hafte kaisa gaya?" — weekly sachchai\n• "Aaj ka plan banao" — bache hue habits ki list\n• "Kamzor habit kaunsi hai?" — fix ke saath\n• "Focus time / streak kitna hai?"\n• "Coins kaise kamau?"\n\nAgar free wali **AI API key** (Gemini/Groq) laga do to mai kisi bhi sawal ka jawab dunga, full planning ke saath. Upar "AI settings" mai hai — key sirf tumhare device par rehti hai. 🔐`
}
export const COACH_QUICK = ['📊 Iss hafte kaisa gaya?', '📋 Aaj ka plan banao', '🎯 Kamzor habit kaunsi hai?', '🔥 Motivate karo', '⏱️ Focus time kitna hai?']
