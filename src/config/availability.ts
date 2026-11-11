import { weeklySchedule } from "./business";

export type DayOverride = {
  date: string;
  enabled: boolean;
  start?: number;
  end?: number;
  blockedTimes?: string[];
  availableTimes?: string[];
  slotDurations?: Record<string, number>;
};

const storageKey = "keylin-day-overrides";

export function readDayOverrides(): DayOverride[] {
  try {
    const saved = window.localStorage.getItem(storageKey);
    return saved ? (JSON.parse(saved) as DayOverride[]) : [];
  } catch {
    return [];
  }
}

export function saveDayOverrides(overrides: DayOverride[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(overrides));
}

export function dateKey(date: Date) {
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  return `${date.getFullYear()}-${month}-${date.getDate().toString().padStart(2, "0")}`;
}

export function getScheduleForDate(date: Date, overrides: DayOverride[]) {
  const override = overrides.find((item) => item.date === dateKey(date));
  if (date.getDay() === 0) return null;
  const regularSchedule =
    date.getDay() === 6
      ? { start: weeklySchedule.saturdayStart, end: weeklySchedule.saturdayEnd }
      : date.getDay() === 2
        ? {
            start: weeklySchedule.weekdayMorningStart,
            end: weeklySchedule.weekdayMorningEnd,
          }
        : date.getDay() === 4
          ? {
              start: weeklySchedule.thursdayStart,
              end: weeklySchedule.thursdayEnd,
            }
          : {
              start: weeklySchedule.weekdayStart,
              end: weeklySchedule.weekdayEnd,
            };
  if (override)
    return override.enabled
      ? {
          start: override.start ?? regularSchedule.start,
          end: override.end ?? regularSchedule.end,
        }
      : null;
  return regularSchedule;
}

export function formatTimeLabel(hour: number, minute: number) {
  const suffix = hour >= 12 ? "p. m." : "a. m.";
  const displayHour = hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

export function getBlockedTimes(date: Date, overrides: DayOverride[]) {
  return (
    overrides.find((item) => item.date === dateKey(date))?.blockedTimes ?? []
  );
}
