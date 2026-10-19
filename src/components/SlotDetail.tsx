import { useMemo, useState } from 'react'
import { api } from '../api'
import type { Absence, Player, Session, Signup } from '../api'
import { awayOn, describeAbsence } from '../absence'
import { LANES, MODE_INFO, MODES, ROLE_LABEL, allReadiness, solveLineup } from '../lol'
import type { Mode, Role } from '../lol'
import { HOUR, formatHour, formatSlot, gamingDayOf, icsFor, relative } from '../time'
import { candidatesOf } from '../useSchedule'
import { Avatar, LaneSummary, ModePicker, Modal, RoleIcon, RolePicker } from './ui'

const MAX = 5
const STATE_LABEL = { full: 'Full', ready: 'Ready', close: 'Almost', no: 'Not yet' }

export function SlotDetail({ slot, signups, sessions, players, me, absences, askIdentity, onClose, onChanged }: {
  slot: number; signups: Signup[]; sessions: Session[]; players: Player[]; me: Player | null; absences: Absence[]
  askIdentity: () => void; onClose: () => void; onChanged: () => Promise<void>
}) {
  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players])
  const mine = me ? signups.find((signup) => signup.playerId === me.id) : undefined
  const [roles, setRoles] = useState<Role[]>(mine?.roles ?? me?.roles ?? ['fill'])
  const [modes, setModes] = useState<Mode[]>(mine?.modes ?? (me?.modes.length ? me.modes : [...MODES]))
  const [note, setNote] = useState(mine?.note ?? '')
  const [hours, setHours] = useState(1)
  const [lockMode, setLockMode] = useState<Mode>('flex')
  const [lockTitle, setLockTitle] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const candidates = candidatesOf(signups)
  const lineup = solveLineup(candidates)
  const readiness = allReadiness(candidates)
  const laneOf = new Map(Object.entries(lineup.assignment).map(([lane, playerId]) => [playerId, lane as Role]))
  const isFull = signups.length >= MAX && !mine
  const past = slot + HOUR < Date.now()
  const away = awayOn(absences, gamingDayOf(slot))
  const meAway = me ? away.some((absence) => absence.playerId === me.id) : false

  const run = async (action: () => Promise<unknown>, done?: string) => {
    setBusy(true); setStatus('')
    try { await action(); await onChanged(); if (done) setStatus(done) } catch (reason) { setStatus(reason instanceof Error ? reason.message : 'That did not work.') } finally { setBusy(false) }
  }
  const join = () => {
    if (!me) return askIdentity()
    if (roles.length === 0 || modes.length === 0) return setStatus('Pick at least one role and one mode.')
    const slots = Array.from({ length: hours }, (_, index) => slot + index * HOUR)
    return run(async () => {
      const result = await api.join({ playerId: me.id, slots, roles, modes, note })
      if (result.full.length) setStatus(`Saved, but ${result.full.map(formatHour).join(', ')} ${result.full.length === 1 ? 'was' : 'were'} already full.`)
    }, mine ? 'Updated.' : 'You are in. Moo!')
  }
  const leave = () => me && run(() => api.leave(me.id, [slot]), 'Left the slot.')
  const lock = () => run(() => api.lockSession({ slot, mode: lockMode, title: lockTitle, createdBy: me?.id ?? null }), 'Session locked in.')

  const discordText = () => {
    const lines = signups.map((signup) => {
      const player = playerById.get(signup.playerId)
      const lane = laneOf.get(signup.playerId)
      return `• ${player?.name ?? '?'}${lane ? ` (${ROLE_LABEL[lane]})` : ` (${signup.roles.map((role) => ROLE_LABEL[role]).join('/')})`}${signup.note ? `: ${signup.note}` : ''}`
    })
    const locked = sessions.map((session) => MODE_INFO[session.mode].label).join(' + ')
    const best = readiness.filter((item) => item.state === 'full' || item.state === 'ready').map((item) => MODE_INFO[item.mode].short).join(', ')
    return [`🐄🔨 **Cowbuilders** ${formatSlot(slot)}${locked ? ` · **${locked}**` : ''}`, `${signups.length}/${MAX} in${best ? ` · ready for ${best}` : ''}`, ...lines,
      signups.length < MAX ? `${MAX - signups.length} seat${MAX - signups.length === 1 ? '' : 's'} open, sign up: ${window.location.origin}/schedule?slot=${slot}` : 'Full house!'].join('\n')
  }
  const copyDiscord = async () => {
    try { await navigator.clipboard.writeText(discordText()); setStatus('Copied for Discord.') } catch { setStatus('Clipboard blocked by the browser.') }
  }
  const downloadIcs = (session: Session) => {
    const names = signups.map((signup) => playerById.get(signup.playerId)?.name).filter(Boolean).join(', ')
    const blob = new Blob([icsFor(slot, `Cowbuilders: ${session.title || MODE_INFO[session.mode].label}`, `${MODE_INFO[session.mode].label} with ${names}`)], { type: 'text/calendar' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `cowbuilders-${session.mode}-${new Date(slot).toISOString().slice(0, 13)}.ics`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <Modal title={formatSlot(slot)} onClose={onClose} wide>
      <p className="muted slot-sub">{relative(slot) === 'past' ? 'This slot is in the past.' : `Starts ${relative(slot)}`} · {signups.length}/{MAX} cowbuilders</p>

      {sessions.length > 0 && (
        <div className="locked-list">
          {sessions.map((session) => (
            <div key={session.id} className="locked">
              <span className="lock-badge">🔒 {MODE_INFO[session.mode].label}</span>
              <span>{session.title}</span>
              <span className="muted">{session.createdBy ? `by ${playerById.get(session.createdBy)?.name ?? '?'}` : ''}</span>
              <span className="spacer" />
              <button type="button" className="button small ghost" onClick={() => downloadIcs(session)}>📅 .ics</button>
              <button type="button" className="button small ghost danger" disabled={busy} onClick={() => run(() => api.cancelSession(session.id), 'Session cancelled.')}>Cancel</button>
            </div>
          ))}
        </div>
      )}

      {away.length > 0 && (
        <div className="away-strip">
          <span className="away-title">Away that day</span>
          {away.map((absence) => {
            const player = playerById.get(absence.playerId)
            return player && <span key={absence.id} className="away-chip"><span className="away-avatar"><Avatar player={player} size={24} /></span>{player.name} <span className="muted">{describeAbsence(absence)}</span></span>
          })}
        </div>
      )}

      <div className="slot-grid">
        <section>
          <h3>Lobby</h3>
          <ul className="lobby">
            {signups.map((signup) => {
              const player = playerById.get(signup.playerId)
              const lane = laneOf.get(signup.playerId)
              return (
                <li key={signup.playerId} className={signup.playerId === me?.id ? 'mine' : ''}>
                  {player && <Avatar player={player} size={40} />}
                  <div>
                    <strong>{player?.name ?? 'Unknown'}</strong>
                    <div className="lobby-meta"><LaneSummary roles={signup.roles} /> <span className="muted">{signup.modes.map((mode) => MODE_INFO[mode].short).join(' · ')}</span></div>
                    {signup.note && <div className="note">“{signup.note}”</div>}
                  </div>
                  {lane && <span className="assigned" title="Suggested lane"><RoleIcon role={lane} size={22} /></span>}
                </li>
              )
            })}
            {Array.from({ length: Math.max(0, MAX - signups.length) }, (_, index) => <li key={`open-${index}`} className="open-seat">Open seat</li>)}
          </ul>
        </section>

        <section>
          <h3>Suggested lineup</h3>
          <ul className="lineup">
            {LANES.map((lane) => {
              const player = playerById.get(lineup.assignment[lane] ?? -1)
              return (
                <li key={lane} className={player ? '' : 'missing'}>
                  <RoleIcon role={lane} size={22} /> <span>{ROLE_LABEL[lane]}</span>
                  <strong>{player ? player.name : 'missing'}</strong>
                </li>
              )
            })}
          </ul>
          <h3>What can we play?</h3>
          <ul className="readiness">
            {readiness.map((item) => (
              <li key={item.mode} className={`state-${item.state}`} title={MODE_INFO[item.mode].blurb}>
                <span className="mode-name">{MODE_INFO[item.mode].label}</span>
                <span className="state-tag">{STATE_LABEL[item.state]}</span>
                <span className="muted">{item.note}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {!past && (
        <section className="my-signup hextech-panel">
          <h3>{mine ? 'Your signup' : isFull ? 'Lobby is full' : me ? `Join as ${me.name}` : 'Join this slot'}</h3>
          {meAway && <p className="form-error">Heads up: you marked yourself away on this day.</p>}
          {!me && <p><button type="button" className="button" onClick={askIdentity}>Tell us who you are first</button></p>}
          {me && !isFull && (
            <>
              <div className="field"><span>Roles for this slot</span><RolePicker value={roles} onChange={setRoles} /></div>
              <div className="field"><span>Up for</span><ModePicker value={modes} onChange={setModes} /></div>
              <div className="form-row">
                <label>Note<input value={note} maxLength={140} onChange={(event) => setNote(event.target.value)} placeholder="only until 22:00, bringing snacks…" /></label>
                <label>For<select value={hours} onChange={(event) => setHours(Number(event.target.value))}>
                  {[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} hour{count > 1 ? 's' : ''} (until {formatHour(slot + count * HOUR)})</option>)}
                </select></label>
              </div>
              <div className="actions">
                {mine && <button type="button" className="button ghost danger" disabled={busy} onClick={() => void leave()}>Leave</button>}
                <button type="button" className="button" disabled={busy} onClick={() => void join()}>{mine ? 'Update' : 'Join lobby'}</button>
              </div>
            </>
          )}
        </section>
      )}

      <section className="slot-tools">
        <div className="lock-form">
          <select value={lockMode} onChange={(event) => setLockMode(event.target.value as Mode)} aria-label="Mode to lock in">
            {MODES.map((mode) => <option key={mode} value={mode}>{MODE_INFO[mode].label}</option>)}
          </select>
          <input value={lockTitle} maxLength={80} onChange={(event) => setLockTitle(event.target.value)} placeholder="Title (optional), e.g. Clash Cup day 1" />
          <button type="button" className="button gold" disabled={busy} onClick={() => void lock()}>🔒 Lock in session</button>
        </div>
        <button type="button" className="button ghost" onClick={() => void copyDiscord()}>📋 Copy for Discord</button>
      </section>
      {status && <p className="status" role="status">{status}</p>}
    </Modal>
  )
}
