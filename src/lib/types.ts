export type ID = string
export type TrackingType = 'checkbox' | 'duration' | 'count' | 'numeric'
export type ScheduleType = 'daily' | 'weekdays' | 'custom'
export type LogStatus = 'completed' | 'partial' | 'skipped' | 'rest' | 'freeze' | 'missed' | 'none'
export type TimerMode = 'stopwatch' | 'countdown' | 'pomodoro'

export interface Habit {
  id: ID; name: string; category: string; icon: string; color: string
  description: string; target: number; unit: string
  trackingType: TrackingType; scheduleType: ScheduleType
  weekdays: number[] // 0=Sun … 6=Sat (used for weekdays/custom)
  reminderTime: string // "HH:MM" or ""
  paused: boolean; order: number; createdAt: string
}
export interface HabitLog {
  id: ID; habitId: ID; date: string // YYYY-MM-DD local
  status: Exclude<LogStatus, 'none'>; value: number; note: string; updatedAt: string
}
export interface FocusSession {
  id: ID; habitId: ID; start: string; end: string
  durationSec: number; mode: TimerMode; phase?: 'focus' | 'break'; note: string
}
export interface Goal {
  id: ID; title: string; period: 'daily' | 'weekly' | 'monthly'
  habitId: ID | '' // '' = all habits (focus minutes)
  target: number; unit: string
  metric: 'focusMinutes' | 'completions'
  createdAt: string
}
export interface JournalNote { id: ID; date: string; title: string; body: string; mood: string; updatedAt: string }
export interface Settings {
  userName: string; theme: 'dark' | 'light'; accent: 'green' | 'cyan' | 'violet' | 'gold'
  socialHandle: string // e.g. @Codenix — printed on share cards
  aiProvider: 'none' | 'Gemini' | 'Groq'; aiApiKey: string; aiModel: string; aiLanguage: 'hinglish' | 'english' | 'hindi'
  weekStart: 'Monday' | 'Sunday'
  pomodoroFocusMin: number; pomodoroBreakMin: number; countdownDefaultMin: number
  xpPerCompletion: number; notifications: boolean
}
export interface TimerPersist {
  habitId: ID | ''; mode: TimerMode; phase: 'focus' | 'break'
  status: 'idle' | 'running' | 'paused'
  segmentStart: number | null // epoch ms when current running segment began
  accumulatedSec: number      // active seconds before current segment (paused time excluded)
  targetSec: number; sessionStartISO: string | null
}
export interface QuestClaim { date: string; questId: string; reward: number }
export interface RewardClaim { date: string; kind: 'mysteryBox'; coins: number; freeze: boolean }
export interface Gamification {
  spentCoins: number          // coins balance = earned (computed) - spentCoins
  freezes: number             // streak-freeze inventory 🧊
  questClaims: QuestClaim[]
  rewardClaims: RewardClaim[] // 🎁 daily mystery box (1/day, reload se farm nahi hota)
  unlocked: string[]          // shop unlock ids (skins, gold accent...)
  avatar: string              // selected avatar emoji
}
export interface Profile {
  persona: string             // student | coder | creator | fitness | self
  level: 'beginner' | 'regular' | 'pro'
  dayPart: 'morning' | 'afternoon' | 'evening' | 'night'
  onboarded: boolean
}
export interface AppState {
  version: 1; habits: Habit[]; logs: HabitLog[]; sessions: FocusSession[]
  goals: Goal[]; notes: JournalNote[]; categories: string[]
  settings: Settings; timer: TimerPersist; demo?: boolean; gamification: Gamification
  profile: Profile; moods: { date: string; mood: string }[]
}
