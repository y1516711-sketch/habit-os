import { uid } from './date'
import type { AppState, Habit } from './types'

const base = (p: Partial<Habit>): Habit => ({
  id: uid(), name: '', category: 'General', icon: '✅', color: '#22ff88',
  description: '', target: 1, unit: 'minutes', trackingType: 'duration',
  scheduleType: 'daily', weekdays: [1, 2, 3, 4, 5, 6, 0], reminderTime: '',
  paused: false, order: 0, createdAt: new Date().toISOString(), ...p,
})
// Editable sample defaults requested by the user — NOT hard-coded restrictions.
export function seedHabits(): Habit[] {
  return [
    base({ name: 'Coding', category: 'Career', icon: '💻', color: '#22ff88', target: 75, description: 'Deep work coding session', order: 0 }),
    base({ name: 'Cyber Security', category: 'Career', icon: '🛡️', color: '#22d3ee', target: 60, description: 'Study & labs', order: 1 }),
    base({ name: 'YouTube / Codenix', category: 'Creator', icon: '🎥', color: '#f472b6', target: 80, description: 'Script, record or edit', order: 2 }),
    base({ name: 'Gym', category: 'Health', icon: '🏋️', color: '#facc15', target: 60, order: 3 }),
    base({ name: 'Running', category: 'Health', icon: '🏃', color: '#fb923c', target: 30, order: 4 }),
    base({ name: 'English / Self-improvement', category: 'Mind', icon: '📚', color: '#a78bfa', target: 20, order: 5 }),
  ]
}
export function defaultState(): AppState {
  return {
    version: 1, habits: seedHabits(), logs: [], sessions: [], goals: [], notes: [],
    categories: ['Career', 'Creator', 'Health', 'Mind', 'General'],
    settings: {
      userName: '', theme: 'dark', accent: 'green', weekStart: 'Monday',
      pomodoroFocusMin: 25, pomodoroBreakMin: 5, countdownDefaultMin: 30,
      xpPerCompletion: 20, notifications: false,
      socialHandle: '@Codenix', aiProvider: 'none', aiApiKey: '', aiModel: '', aiLanguage: 'hinglish',
    },
    gamification: { spentCoins: 0, freezes: 1, questClaims: [], rewardClaims: [], unlocked: ['avatar-rocket'], avatar: '🚀' },
    profile: { persona: '', level: 'regular', dayPart: 'morning', onboarded: false },
    moods: [],
    timer: { habitId: '', mode: 'pomodoro', phase: 'focus', status: 'idle', segmentStart: null, accumulatedSec: 0, targetSec: 1500, sessionStartISO: null },
    demo: false,
  }
}
