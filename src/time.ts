// Slots are hour starts in UTC milliseconds; the grid is laid out in the viewer's local time.
// A "gaming day" runs from its morning until 03:00 the next night, so Friday 01:00 is still Friday night.

export const HOUR = 3_600_000
export const DAY = 24 * HOUR
export const ALL_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2]
export const EVENING_HOURS = ALL_HOURS.filter((hour) => hour >= 15 || hour < 3)
export const NIGHT_CUTOFF = 6

export const startOfWeek = (date: Date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
}
export const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
export const weekDays = (weekStart: Date) => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))

export const slotFor = (gamingDay: Date, hour: number) => {
  const date = addDays(gamingDay, hour < NIGHT_CUTOFF ? 1 : 0)
  date.setHours(hour)
  return date.getTime()
}
/** The gaming day a slot belongs to (00:00–05:59 count towards the previous evening). */
export const gamingDayOf = (slot: number) => {
  const date = new Date(slot)
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return date.getHours() < NIGHT_CUTOFF ? addDays(day, -1) : day
}
export const currentSlot = () => {
  const now = new Date()
  now.setMinutes(0, 0, 0)
  return now.getTime()
}

const locale = undefined
export const formatHour = (slot: number) => new Date(slot).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
export const formatDay = (date: Date) => date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
export const formatWeekday = (date: Date) => date.toLocaleDateString(locale, { weekday: 'long' })
export const formatSlot = (slot: number) => `${formatDay(gamingDayOf(slot))} · ${formatHour(slot)}`
export const formatRange = (weekStart: Date) => {
  const end = addDays(weekStart, 6)
  return `${weekStart.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`
}
export const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

export const relative = (slot: number) => {
  const minutes = Math.round((slot - Date.now()) / 60000)
  if (minutes <= 0 && minutes > -60) return 'now'
  if (minutes < 0) return 'past'
  if (minutes < 60) return `in ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `in ${hours} h`
  return `in ${Math.round(hours / 24)} d`
}

/** Minimal .ics for one session so people can drop it into their own calendar. */
export const icsFor = (slot: number, title: string, description: string) => {
  const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const escape = (value: string) => value.replace(/[\\,;]/g, (char) => `\\${char}`).replace(/\n/g, '\\n')
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cowbuilders//HQ//EN', 'BEGIN:VEVENT',
    `UID:${slot}-${encodeURIComponent(title)}@cowbuilders`, `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(slot)}`, `DTEND:${stamp(slot + 2 * HOUR)}`,
    `SUMMARY:${escape(title)}`, `DESCRIPTION:${escape(description)}`, 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
}
