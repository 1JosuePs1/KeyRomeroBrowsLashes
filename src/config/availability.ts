import { weeklySchedule } from './business'

export type DayOverride = {
  date: string
  enabled: boolean
  start?: number
  end?: number
  blockedTimes?: string[]
}

const storageKey = 'keylin-day-overrides'

export function readDayOverrides(): DayOverride[] {
  try {
    const saved = window.localStorage.getItem(storageKey)
    return saved ? JSON.parse(saved) as DayOverride[] : []
  } catch {
    return []
  }
}

export function saveDayOverrides(overrides: DayOverride[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(overrides))
}

export function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function getScheduleForDate(date: Date, overrides: DayOverride[]) {
  const override = overrides.find((item) => item.date === dateKey(date))
  if (override) return override.enabled ? { start: override.start ?? weeklySchedule.weekdayStart, end: override.end ?? weeklySchedule.weekdayEnd } : null
  if (date.getDay() === 0) return null
  return date.getDay() === 6
    ? { start: weeklySchedule.saturdayStart, end: weeklySchedule.saturdayEnd }
    : { start: weeklySchedule.weekdayStart, end: weeklySchedule.weekdayEnd }
}

export function formatTimeLabel(hour: number, minute: number) {
  const suffix = hour >= 12 ? 'p. m.' : 'a. m.'
  const displayHour = hour > 12 ? hour - 12 : hour
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${suffix}`
}

export function getBlockedTimes(date: Date, overrides: DayOverride[]) {
  return overrides.find((item) => item.date === dateKey(date))?.blockedTimes ?? []
}
