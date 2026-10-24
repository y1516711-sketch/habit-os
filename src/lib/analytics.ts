import { addDays, parseKey, todayKey, toKey } from './date'
import type { AppState, Habit, HabitLog } from './types'

export const isScheduled = (h: Habit, dateKey: string): boolean => {
  if (h.paused) return false
  if (h.scheduleType === 'daily') return true
  return h.weekdays.includes(parseKey(dateKey).getDay())
}
export const logFor = (state: AppState, habitId: string, date: string): HabitLog | undefined =>
  state.logs.find(l => l.habitId === habitId && l.date === date)
export const scheduledOn = (state: AppState, date: string): Habit[] =>
  [...state.habits].sort((a, b) => a.order - b.order).filter(h => isScheduled(h, date))

/** % for a day. completed=1, partial=0.5. Rest days excluded from denominator (never punish rest). Skipped counts in denominator. */
export function dayStats(state: AppState, date: string) {
  const sched = scheduledOn(state, date)
  let completed = 0, partial = 0, skipped = 0, rest = 0, freeze = 0, score = 0
  for (const h of sched) {
    const l = logFor(state, h.id, date)
    if (!l) continue
    if (l.status === 'completed') { completed++; score += 1 }
    else if (l.status === 'partial') { partial++; score += 0.5 }
    else if (l.status === 'skipped') skipped++
    else if (l.status === 'rest') rest++
    else if (l.status === 'freeze') freeze++ // 🧊 freeze day: protected like rest
  }
  const denom = Math.max(0, sched.length - rest - freeze)
  return {
    total: sched.length, completed, partial, skipped, rest, freeze,
    remaining: Math.max(0, sched.length - completed - partial - skipped - rest - freeze),
    pct: denom === 0 ? 0 : Math.round((score / denom) * 100),
  }
}
export const focusMinutesOn = (state: AppState, date: string, habitId?: string): number => {
  // Backward compatible: old sessions without phase are focus sessions.
  const savedSec = state.sessions
    .filter(s => s.phase !== 'break' && toKey(new Date(s.start)) === date && (!habitId || s.habitId === habitId))
    .reduce((a, s) => a + s.durationSec, 0)
  // Include the current focus session while it is running/paused. Once it is
  // finished, the persisted session above replaces this live value, so there
  // is no double-counting.
  const timer = state.timer
  const liveDate = timer.sessionStartISO ? toKey(new Date(timer.sessionStartISO)) : ''
  const liveSec = timer.status !== 'idle' && timer.phase !== 'break' && liveDate === date && (!habitId || timer.habitId === habitId)
    ? timer.accumulatedSec + (timer.status === 'running' && timer.segmentStart ? (Date.now() - timer.segmentStart) / 1000 : 0)
    : 0
  return (savedSec + liveSec) / 60
}
export const focusMinutesBetween = (state: AppState, keys: string[], habitId?: string): number =>
  keys.reduce((a, k) => a + focusMinutesOn(state, k, habitId), 0)

/** Schedule-aware per-habit streak. Unscheduled & rest days are skipped (never break). Partial counts as effort day. */
export function habitStreak(state: AppState, habit: Habit): { current: number; longest: number } {
  let current = 0, longest = 0, run = 0
  const today = todayKey()
  // longest: scan from creation-ish (400 days back max) forward
  let cur = addDays(today, -400)
  for (let i = 0; i <= 400; i++) {
    const key = addDays(cur, i)
    if (!isScheduled(habit, key)) continue
    const l = logFor(state, habit.id, key)
    if (l?.status === 'rest' || l?.status === 'freeze') continue
    if (l?.status === 'completed' || l?.status === 'partial') { run++; longest = Math.max(longest, run) }
    else if (key < today) run = 0
  }
  // current: walk backwards; today not-yet-done doesn't break the streak
  let d = today, first = true
  for (let i = 0; i < 400; i++) {
    if (isScheduled(habit, d)) {
      const l = logFor(state, habit.id, d)
      if (l?.status === 'completed' || l?.status === 'partial') current++
      else if (l?.status === 'rest' || l?.status === 'freeze') { /* protected day: skip, streak safe */ }
      else if (first && d === today) { /* day still in progress */ }
      else break
    }
    first = false; d = addDays(d, -1)
  }
  return { current, longest }
}
/** Overall streak: consecutive days with ≥70% completion (days with nothing scheduled are skipped). */
export function overallStreak(state: AppState): { current: number; longest: number } {
  const today = todayKey()
  let longest = 0, run = 0
  for (let i = 400; i >= 0; i--) {
    const key = addDays(today, -i)
    const s = dayStats(state, key)
    if (s.total === 0 || s.total === s.rest + s.freeze) continue
    if (s.pct >= 70) { run++; longest = Math.max(longest, run) } else if (key < today) run = 0
  }
  let current = 0, d = today
  for (let i = 0; i < 400; i++) {
    const s = dayStats(state, d)
    if (s.total === 0 || s.total === s.rest + s.freeze) { d = addDays(d, -1); continue }
    if (s.pct >= 70) current++
    else if (d === today) { d = addDays(d, -1); continue }
    else break
    d = addDays(d, -1)
  }
  return { current, longest }
}
export function xpAndLevel(state: AppState) {
  const completed = state.logs.filter(l => l.status === 'completed').length
  const partial = state.logs.filter(l => l.status === 'partial').length
  const focusMin = state.sessions.filter(s => s.phase !== 'break').reduce((a, s) => a + s.durationSec, 0) / 60
  const xp = completed * state.settings.xpPerCompletion + partial * Math.round(state.settings.xpPerCompletion / 2) + Math.floor(focusMin / 10) * 5
  const level = Math.floor(Math.sqrt(xp / 100)) + 1
  const levelStart = Math.pow(level - 1, 2) * 100, nextStart = Math.pow(level, 2) * 100
  return { xp, level, toNext: nextStart - xp, progress: nextStart === levelStart ? 100 : Math.round(((xp - levelStart) / (nextStart - levelStart)) * 100), completed, partial, focusMin }
}
export interface Achievement { id: string; icon: string; title: string; desc: string; unlocked: boolean; hint: string }
export function achievements(state: AppState): Achievement[] {
  const { completed, focusMin } = xpAndLevel(state)
  const bestStreak = state.habits.reduce((m, h) => Math.max(m, habitStreak(state, h).longest), 0)
  const perfectDays = (() => { let c = 0; for (let i = 0; i < 365; i++) { const s = dayStats(state, addDays(todayKey(), -i)); if (s.total > 0 && s.pct === 100) c++ } return c })()
  const sessions = state.sessions.filter(s => s.phase !== 'break').length
  const mk = (id: string, icon: string, title: string, desc: string, unlocked: boolean, hint: string): Achievement => ({ id, icon, title, desc, unlocked, hint })
  return [
    mk('first', '🌱', 'First Step', 'Complete your first habit', completed >= 1, `${completed}/1 completions`),
    mk('ten', '🔥', 'Getting Warm', '10 completions', completed >= 10, `${completed}/10`),
    mk('hundred', '💯', 'Century', '100 completions', completed >= 100, `${completed}/100`),
    mk('streak7', '⚡', '7-Day Streak', 'Best habit streak of 7', bestStreak >= 7, `best ${bestStreak}/7`),
    mk('streak30', '🚀', '30-Day Streak', 'Best habit streak of 30', bestStreak >= 30, `best ${bestStreak}/30`),
    mk('focus10h', '🎯', 'Deep Focus', '10 hours of focus time', focusMin >= 600, `${Math.floor(focusMin / 60)}h/10h`),
    mk('focus100h', '🧠', 'Focus Master', '100 hours of focus time', focusMin >= 6000, `${Math.floor(focusMin / 60)}h/100h`),
    mk('perfect', '👑', 'Perfect Day', 'A 100% day', perfectDays >= 1, `${perfectDays} perfect days`),
    mk('timer25', '⏱️', 'Timer Pro', '25 focus sessions', sessions >= 25, `${sessions}/25 sessions`),
  ]
}
/** Local rule-based insights from REAL saved data only. No AI API is called. */
export function insights(state: AppState): string[] {
  const out: string[] = []
  const today = todayKey()
  if (state.logs.length === 0 && state.sessions.length === 0) {
    return ['No data yet — complete your first habit or run a focus timer and insights will appear here. Nothing is invented: every insight is calculated from your saved data.']
  }
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, -(6 - i)))
  const prev7 = Array.from({ length: 7 }, (_, i) => addDays(today, -(13 - i)))
  const avg = (keys: string[]) => keys.reduce((a, k) => a + dayStats(state, k).pct, 0) / keys.length
  const a7 = avg(last7), p7 = avg(prev7)
  if (a7 - p7 >= 10) out.push(`Consistency is improving: last 7 days average ${Math.round(a7)}% vs ${Math.round(p7)}% the week before (+${Math.round(a7 - p7)} points).`)
  else if (p7 - a7 >= 10) out.push(`Completion slipped: last 7 days average ${Math.round(a7)}% vs ${Math.round(p7)}% before. Consider shrinking one habit's target for a few days.`)
  const f7 = focusMinutesBetween(state, last7), fp = focusMinutesBetween(state, prev7)
  if (fp > 60 && f7 < fp * 0.7) out.push(`Focus time is declining: ${Math.round(f7)} min this week vs ${Math.round(fp)} min last week. Protect one Pomodoro block tomorrow.`)
  else if (fp > 0 && f7 > fp * 1.3) out.push(`Focus time is up strongly: ${Math.round(f7)} min this week vs ${Math.round(fp)} min last week.`)
  // weakest habit last 14 days
  let weakest: { name: string; rate: number } | null = null
  for (const h of state.habits.filter(x => !x.paused)) {
    let done = 0, sched = 0
    for (let i = 0; i < 14; i++) { const k = addDays(today, -i); if (!isScheduled(h, k)) continue; sched++; const l = logFor(state, h.id, k); if (l?.status === 'completed') done++; else if (l?.status === 'partial') done += 0.5; else if (l?.status === 'rest') sched-- }
    if (sched >= 5) { const rate = done / sched; if (!weakest || rate < weakest.rate) weakest = { name: h.name, rate } }
  }
  if (weakest && weakest.rate < 0.5) out.push(`"${weakest.name}" needs attention: ${Math.round(weakest.rate * 100)}% over the last 14 scheduled days. Try a smaller daily target or a better time slot.`)
  // best weekday
  const byDow = new Array(7).fill(0).map(() => ({ sum: 0, n: 0 }))
  for (let i = 0; i < 56; i++) { const k = addDays(today, -i); const s = dayStats(state, k); if (s.total) { const d = parseKey(k).getDay(); byDow[d].sum += s.pct; byDow[d].n++ } }
  const dowAvg = byDow.map((b, i) => ({ i, v: b.n ? b.sum / b.n : -1 })).filter(x => x.v >= 0).sort((a, b) => b.v - a.v)
  if (dowAvg.length >= 3) out.push(`Your strongest weekday is ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dowAvg[0].i]} (${Math.round(dowAvg[0].v)}% average). Schedule hard habits there.`)
  return out.length ? out : ['Keep going — a few more days of data and trend insights will unlock here.']
}
export const MOTIVATION = [
  'Small steps daily beat intensity occasionally.', 'Discipline is choosing what you want most.',
  'You do not rise to the goal, you fall to the system.', 'One focused hour today compounds tomorrow.',
  'Consistency is a superpower anyone can build.', 'Show up, even at 50%. Partial beats zero.',
  'Your future self is watching today’s choices.',
]
export const motivationForToday = () => MOTIVATION[parseKey(todayKey()).getDate() % MOTIVATION.length]

// ---------------- 🎮 Gamification v2: coins, quests, shop, buddy ----------------
export function coins(state: AppState) {
  const completed = state.logs.filter(l => l.status === 'completed').length
  const partial = state.logs.filter(l => l.status === 'partial').length
  const focusMin = state.sessions.filter(s => s.phase !== 'break').reduce((a, s) => a + s.durationSec, 0) / 60
  let perfectDays = 0
  for (let i = 0; i < 365; i++) { const s = dayStats(state, addDays(todayKey(), -i)); if (s.total > 0 && s.pct === 100) perfectDays++ }
  const questCoins = state.gamification.questClaims.reduce((a, c) => a + c.reward, 0)
  const boxCoins = state.gamification.rewardClaims.reduce((a, c) => a + c.coins, 0)
  const earned = completed * 10 + partial * 4 + Math.floor(focusMin / 10) * 2 + perfectDays * 20 + questCoins + boxCoins
  return { earned, spent: state.gamification.spentCoins, balance: Math.max(0, earned - state.gamification.spentCoins), perfectDays }
}
export interface Quest { id: string; icon: string; title: string; desc: string; reward: number; progress: number; target: number; complete: boolean }
function dateSeed(key: string): number { let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0; return h }
/** 3 daily quests, same for the whole day (seeded by date), progress from REAL data. */
export function dailyQuests(state: AppState, date: string = todayKey()): Quest[] {
  const s = dayStats(state, date)
  const focus = Math.round(focusMinutesOn(state, date))
  const sessionsToday = state.sessions.filter(x => toKey(new Date(x.start)) === date).length
  const journalToday = state.notes.some(n => n.date === date) ? 1 : 0
  const active = state.habits.filter(h => !h.paused)
  const seededHabit = active.length ? active[dateSeed(date) % active.length] : null
  const seededDone = seededHabit && ['completed', 'partial'].includes(logFor(state, seededHabit.id, date)?.status || '') ? 1 : 0
  const pool: Quest[] = [
    { id: 'complete3', icon: '✅', title: 'Triple Strike', desc: 'Complete 3 habits today', reward: 15, progress: s.completed, target: 3, complete: s.completed >= 3 },
    { id: 'focus45', icon: '🎯', title: 'Deep Diver', desc: 'Focus 45 minutes with the timer', reward: 20, progress: focus, target: 45, complete: focus >= 45 },
    { id: 'focus90', icon: '🧠', title: 'Marathon Mind', desc: 'Focus 90 minutes today', reward: 35, progress: focus, target: 90, complete: focus >= 90 },
    { id: 'noSkip', icon: '🛡️', title: 'No Excuses', desc: 'Finish the day with zero skips (at least 1 habit done)', reward: 12, progress: s.completed + s.partial > 0 && s.skipped === 0 ? 1 : 0, target: 1, complete: s.completed + s.partial > 0 && s.skipped === 0 },
    { id: 'sessions2', icon: '⏱️', title: 'Double Session', desc: 'Complete 2 timer sessions today', reward: 18, progress: sessionsToday, target: 2, complete: sessionsToday >= 2 },
    { id: 'journal', icon: '📓', title: 'Reflect', desc: 'Write a journal note today', reward: 10, progress: journalToday, target: 1, complete: journalToday >= 1 },
    { id: 'perfect', icon: '👑', title: 'Perfect Day', desc: 'Reach 100% completion today', reward: 40, progress: s.pct, target: 100, complete: s.total > 0 && s.pct >= 100 },
    ...(seededHabit ? [{ id: `habit-${seededHabit.id}`, icon: seededHabit.icon, title: `Quest: ${seededHabit.name}`, desc: `Do ${seededHabit.name} today`, reward: 12, progress: seededDone, target: 1, complete: seededDone >= 1 } as Quest] : []),
  ]
  const seed = dateSeed(date)
  const picked: Quest[] = []
  const order = [...pool].sort((a, b) => ((dateSeed(date + a.id) ^ seed) % 997) - ((dateSeed(date + b.id) ^ seed) % 997))
  for (const q of order) { if (!picked.some(x => x.id === q.id)) picked.push(q); if (picked.length === 3) break }
  // Always include one quick-win quest so every day is winnable:
  if (!picked.some(q => q.reward <= 15)) picked[2] = order.find(q => q.reward <= 15 && !picked.includes(q)) || picked[2]
  return picked
}
export interface ShopItem { id: string; icon: string; title: string; desc: string; cost: number; kind: 'freeze' | 'freeze3' | 'avatar' | 'accent' }
export const SHOP: ShopItem[] = [
  { id: 'freeze1', icon: '🧊', title: 'Streak Freeze ×1', desc: 'Protect one missed day — streak safe rahega', cost: 50, kind: 'freeze' },
  { id: 'freeze3', icon: '🧊🧊🧊', title: 'Streak Freeze ×3', desc: '3 freeze ka pack (sasta padega)', cost: 120, kind: 'freeze3' },
  { id: 'avatar-ninja', icon: '🥷', title: 'Ninja Avatar', desc: 'Share card & profile ke liye', cost: 40, kind: 'avatar' },
  { id: 'avatar-wizard', icon: '🧙', title: 'Wizard Avatar', desc: 'Share card & profile ke liye', cost: 60, kind: 'avatar' },
  { id: 'avatar-super', icon: '🦸', title: 'Superhero Avatar', desc: 'Share card & profile ke liye', cost: 90, kind: 'avatar' },
  { id: 'avatar-astro', icon: '🧑‍🚀', title: 'Astronaut Avatar', desc: 'Share card & profile ke liye', cost: 120, kind: 'avatar' },
  { id: 'accent-gold', icon: '🥇', title: 'Gold Theme', desc: 'Premium gold accent unlock karo', cost: 150, kind: 'accent' },
]
export const AVATARS: Record<string, string> = { 'avatar-rocket': '🚀', 'avatar-ninja': '🥷', 'avatar-wizard': '🧙', 'avatar-super': '🦸', 'avatar-astro': '🧑‍🚀' }
export function buddyForLevel(level: number): { emoji: string; name: string; nextAt: number | null } {
  const stages = [
    { at: 1, emoji: '🥚', name: 'Egg' }, { at: 2, emoji: '🐣', name: 'Hatchling' }, { at: 3, emoji: '🐥', name: 'Chick' },
    { at: 5, emoji: '🦉', name: 'Wise Owl' }, { at: 8, emoji: '🐺', name: 'Wolf' }, { at: 12, emoji: '🦁', name: 'Lion' },
    { at: 18, emoji: '🐉', name: 'Dragon' }, { at: 30, emoji: '👑🐉', name: 'Dragon King' },
  ]
  let cur = stages[0], nextAt: number | null = null
  for (const s of stages) { if (level >= s.at) cur = s; else { nextAt = s.at; break } }
  return { emoji: cur.emoji, name: cur.name, nextAt }
}
/** Past missed days for a habit (freeze lagane layak), most recent first. */
export function missedDaysFor(state: AppState, habit: Habit, withinDays = 60): string[] {
  const out: string[] = []; const today = todayKey()
  for (let i = 1; i <= withinDays; i++) {
    const k = addDays(today, -i)
    if (!isScheduled(habit, k)) continue
    const l = logFor(state, habit.id, k)
    if (!l || l.status === 'missed') out.push(k)
  }
  return out
}

/** Aakhri activity kab thi (comeback banner ke liye). */
export function lastActivityKey(state: AppState): string | null {
  const keys = [...state.logs.map(l => l.date), ...state.sessions.map(s => toKey(new Date(s.start)))]
  return keys.length ? keys.sort().at(-1)! : null
}
export function daysSinceKey(key: string | null): number {
  if (!key) return 999
  return Math.round((parseKey(todayKey()).getTime() - parseKey(key).getTime()) / 86400000)
}
/** Tum vs Pichhle-Hafte-Wale-Tum (khud se competition). */
export function vsLastWeek(state: AppState): { cur: number; prev: number } {
  const avg = (off: number) => Math.round(Array.from({ length: 7 }, (_, i) => dayStats(state, addDays(todayKey(), -(off + 6 - i))).pct).reduce((a, b) => a + b, 0) / 7)
  return { cur: avg(0), prev: avg(7) }
}
