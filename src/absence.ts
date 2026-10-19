import type { Absence, AbsenceKind } from './api'

export const ABSENCE_KINDS: Record<AbsenceKind, { emoji: string; label: string }> = {
  vacation: { emoji: '🏖', label: 'Vacation' },
  exams: { emoji: '📚', label: 'Exams' },
  work: { emoji: '💼', label: 'Work' },
  sick: { emoji: '🤒', label: 'Sick' },
  travel: { emoji: '✈️', label: 'Travelling' },
  other: { emoji: '🚫', label: 'Away' },
}

/** Local calendar day as "YYYY-MM-DD" (absences are stored in the viewer's days, inclusive). */
export const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export const parseDay = (key: string) => { const [year, month, day] = key.split('-').map(Number); return new Date(year, month - 1, day) }
export const formatDayKey = (key: string) => parseDay(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export const awayOn = (absences: Absence[], day: Date) => { const key = dayKey(day); return absences.filter((absence) => absence.start <= key && key <= absence.end) }
export const isAway = (absences: Absence[], playerId: number, day: Date) => awayOn(absences, day).some((absence) => absence.playerId === playerId)
/** The absence a player is in today, or else their next upcoming one. */
export const currentAbsence = (absences: Absence[], playerId: number) => {
  const today = dayKey(new Date())
  return absences.find((absence) => absence.playerId === playerId && absence.start <= today && today <= absence.end)
}
export const describeAbsence = (absence: Absence) => {
  const kind = ABSENCE_KINDS[absence.kind]
  const range = absence.start === absence.end ? formatDayKey(absence.start) : `${formatDayKey(absence.start)} – ${formatDayKey(absence.end)}`
  return `${kind.emoji} ${kind.label} ${range}${absence.note ? ` · ${absence.note}` : ''}`
}
