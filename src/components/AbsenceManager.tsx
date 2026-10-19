import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api'
import type { Absence, AbsenceKind, Player } from '../api'
import { ABSENCE_KINDS, dayKey, describeAbsence } from '../absence'
import { addDays } from '../time'

/** List and add a player's absences (vacation, exams, …). */
export function AbsenceManager({ player, absences, onChanged }: { player: Player; absences: Absence[]; onChanged: () => Promise<void> }) {
  const today = dayKey(new Date())
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(dayKey(addDays(new Date(), 7)))
  const [kind, setKind] = useState<AbsenceKind>('vacation')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const mine = absences.filter((absence) => absence.playerId === player.id && absence.end >= today)

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setStatus('')
    try { await action(); await onChanged() } catch (reason) { setStatus(reason instanceof Error ? reason.message : 'That did not work.') } finally { setBusy(false) }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => { await api.addAbsence({ playerId: player.id, start, end, kind, note }); setNote('') })
  }

  return (
    <div className="absence-manager">
      {mine.length === 0 && <p className="muted">{player.name} has no absences planned.</p>}
      <ul className="absence-list">
        {mine.map((absence) => (
          <li key={absence.id}>
            <span>{describeAbsence(absence)}</span>
            <button type="button" className="button small ghost danger" disabled={busy} onClick={() => void run(() => api.removeAbsence(absence.id))}>Remove</button>
          </li>
        ))}
      </ul>
      <form className="form" onSubmit={submit}>
        <div className="chip-row" role="group" aria-label="Reason">
          {(Object.keys(ABSENCE_KINDS) as AbsenceKind[]).map((item) => (
            <button type="button" key={item} className={`chip ${kind === item ? 'on' : ''}`} aria-pressed={kind === item} onClick={() => setKind(item)}>
              {ABSENCE_KINDS[item].emoji} {ABSENCE_KINDS[item].label}
            </button>
          ))}
        </div>
        <div className="form-row even">
          <label>From<input type="date" value={start} required onChange={(event) => { setStart(event.target.value); if (event.target.value > end) setEnd(event.target.value) }} /></label>
          <label>Until (incl.)<input type="date" value={end} min={start} required onChange={(event) => setEnd(event.target.value)} /></label>
        </div>
        <label>Note<input value={note} maxLength={80} onChange={(event) => setNote(event.target.value)} placeholder="Mallorca, no laptop, back for Clash" /></label>
        {status && <p className="form-error">{status}</p>}
        <div className="actions"><button type="submit" className="button gold" disabled={busy}>Add absence</button></div>
      </form>
    </div>
  )
}
