import { useMemo, useState } from 'react'
import type { AppContext } from '../App'
import { api } from '../api'
import type { Player } from '../api'
import { MODE_INFO, ROLE_LABEL, centered } from '../lol'
import { DAY, startOfWeek } from '../time'
import { useSchedule } from '../useSchedule'
import { PlayerForm } from '../components/PlayerForm'
import { Avatar, Modal, RoleIcon } from '../components/ui'
import { AbsenceManager } from '../components/AbsenceManager'
import { CalendarFeed } from '../components/CalendarFeed'
import { currentAbsence, dayKey, describeAbsence } from '../absence'

export function Roster({ players, me, refreshPlayers, absences, refreshAbsences }: AppContext) {
  const [editing, setEditing] = useState<Player | 'new' | null>(null)
  const [awayFor, setAwayFor] = useState<Player | null>(null)
  const [calendarFor, setCalendarFor] = useState<Player | null>(null)
  const today = dayKey(new Date())
  const [status, setStatus] = useState('')
  const [weekStart] = useState(() => startOfWeek(new Date()).getTime())
  const { schedule } = useSchedule(weekStart, weekStart + 7 * DAY)
  const hoursThisWeek = useMemo(() => {
    const counts = new Map<number, number>()
    schedule.signups.forEach((signup) => counts.set(signup.playerId, (counts.get(signup.playerId) ?? 0) + 1))
    return counts
  }, [schedule.signups])

  const remove = async (player: Player) => {
    if (!window.confirm(`Remove ${player.name} from the clan? Their signups go with them.`)) return
    try { await api.deletePlayer(player.id); await refreshPlayers(); setEditing(null) } catch (reason) { setStatus(reason instanceof Error ? reason.message : 'Could not remove.') }
  }

  return (
    <div className="roster-page">
      <section className="page-head">
        <div>
          <p className="eyebrow">The herd</p>
          <h1>Roster</h1>
          <p className="muted">{players.length} cowbuilder{players.length === 1 ? '' : 's'} sworn to the barn.</p>
        </div>
        <button type="button" className="button gold" onClick={() => setEditing('new')}>+ Recruit cowbuilder</button>
      </section>
      {status && <div className="banner error">{status}</div>}

      <div className="roster">
        {players.map((player) => {
          const away = currentAbsence(absences, player.id)
          const upcoming = absences.find((absence) => absence.playerId === player.id && absence.start > today)
          return (
          <article key={player.id} className={`member-card ${player.id === me?.id ? 'mine' : ''} ${away ? 'away' : ''}`}>
            {away && <div className="away-ribbon" title={describeAbsence(away)}>{describeAbsence(away)}</div>}
            <div className="member-art" style={{ backgroundImage: `url(${centered(player.champion)})` }} />
            <div className="member-body">
              <div className="member-title">
                <Avatar player={player} size={48} />
                <div>
                  <h3>{player.name}</h3>
                  <span className="muted">{player.rank || 'Rank unknown'}</span>
                </div>
              </div>
              <div className="member-roles">
                {player.roles.map((role, index) => (
                  <span key={role} className={`member-role ${index === 0 ? 'main' : ''}`}><RoleIcon role={role} size={18} />{ROLE_LABEL[role]}</span>
                ))}
              </div>
              {player.motto && <p className="motto">“{player.motto}”</p>}
              <div className="member-modes">{player.modes.map((mode) => <span key={mode}>{MODE_INFO[mode].short}</span>)}</div>
              <dl className="member-stats">
                <div><dt>This week</dt><dd>{hoursThisWeek.get(player.id) ?? 0} h</dd></div>
                <div><dt>All time</dt><dd>{player.totalSignups ?? 0} h</dd></div>
              </dl>
              {upcoming && !away && <p className="upcoming-away">Planned: {describeAbsence(upcoming)}</p>}
              <div className="member-actions">
                <button type="button" className="button small ghost" onClick={() => setEditing(player)}>Edit</button>
                <button type="button" className="button small ghost" onClick={() => setAwayFor(player)}>🏖 Away</button>
                <button type="button" className="button small ghost" onClick={() => setCalendarFor(player)}>📅 Calendar</button>
              </div>
            </div>
          </article>
          )
        })}
        {players.length === 0 && <p className="muted">The barn is empty. Recruit the first cowbuilder!</p>}
      </div>

      {calendarFor && (
        <Modal title={`${calendarFor.name}: calendar feed`} onClose={() => setCalendarFor(null)}>
          <CalendarFeed player={calendarFor} />
        </Modal>
      )}

      {awayFor && (
        <Modal title={`${awayFor.name}: absences`} onClose={() => setAwayFor(null)}>
          <AbsenceManager player={awayFor} absences={absences} onChanged={refreshAbsences} />
        </Modal>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'Recruit a cowbuilder' : `Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <PlayerForm
            player={editing === 'new' ? undefined : editing}
            onSaved={async () => { await refreshPlayers(); setEditing(null) }}
            onCancel={() => setEditing(null)}
            submitLabel={editing === 'new' ? 'Recruit' : 'Save'}
          />
          {editing !== 'new' && <button type="button" className="button small ghost danger kick" onClick={() => void remove(editing)}>Kick from clan</button>}
        </Modal>
      )}
    </div>
  )
}
