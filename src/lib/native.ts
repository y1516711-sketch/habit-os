import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { isScheduled } from './analytics'
import { addDays, todayKey } from './date'
import type { AppState } from './types'

export const isNativeApp = (): boolean => {
  try { return Capacitor.isNativePlatform() } catch { return false }
}
export async function requestNativeReminderPermissions(): Promise<{ notifications: boolean; exactAlarms: boolean }> {
  if (!isNativeApp()) return { notifications: false, exactAlarms: false }
  const permission = await LocalNotifications.requestPermissions()
  if (permission.display !== 'granted') return { notifications: false, exactAlarms: false }
  if (Capacitor.getPlatform() !== 'android') return { notifications: true, exactAlarms: true }

  let exact = await LocalNotifications.checkExactNotificationSetting()
  if (exact.exact_alarm !== 'granted') exact = await LocalNotifications.changeExactNotificationSetting()
  return { notifications: true, exactAlarms: exact.exact_alarm === 'granted' }
}
const ID_BASE = 4100
/**
 * 📱 Android app ke asli reminders: agle 7 din ke scheduled slots ko
 * LocalNotifications se set kar deta hai — app BAND ho tab bhi bajega.
 * App khulne par dobara schedule hota hai (rolling 7 days).
 */
export async function scheduleNativeReminders(state: AppState): Promise<boolean> {
  if (!isNativeApp()) return false
  try {
    // purane HabitOS reminders saaf karo
    const pending = await LocalNotifications.getPending()
    const ours = pending.notifications.filter(n => n.id >= ID_BASE && n.id < ID_BASE + 500)
    if (ours.length) await LocalNotifications.cancel({ notifications: ours.map(n => ({ id: n.id })) })
    if (!state.settings.notifications) return true
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') return false
    const notifications: { id: number; title: string; body: string; schedule: { at: Date }; allowWhileIdle?: boolean }[] = []
    let slot = 0
    const now = Date.now()
    for (const h of state.habits) {
      if (h.paused || !h.reminderTime) continue
      const [hh, mm] = h.reminderTime.split(':').map(Number)
      for (let d = 0; d <= 7 && slot < 480; d++) {
        const key = addDays(todayKey(), d)
        if (!isScheduled(h, key)) continue
        const at = new Date(`${key}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`)
        if (at.getTime() <= now) continue
        notifications.push({
          id: ID_BASE + slot++,
          title: `🔔 ${h.icon} ${h.name}`,
          body: `Samay ho gaya: ${h.target} ${h.unit}. Chalo shuru karein! 💪`,
          schedule: { at },
          allowWhileIdle: true,
        })
      }
    }
    if (notifications.length) await LocalNotifications.schedule({ notifications })
    return true
  } catch { return false /* native na ho to chup-chaap web mode */ }
}
