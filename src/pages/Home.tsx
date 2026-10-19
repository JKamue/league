import { useEffect, useMemo, useState } from 'react'
import type { AppContext } from '../App'
import { api } from '../api'
import type { Activity } from '../api'
import { GALLERY, MODE_INFO, allReadiness, splash } from '../lol'
import { DAY, HOUR, addDays, currentSlot, formatSlot, relative } from '../time'
import { ABSENCE_KINDS, dayKey, formatDayKey } from '../absence'
import { candidatesOf, useSchedule } from '../useSchedule'
import { SlotDetail } from '../components/SlotDetail'
import { Avatar, Crest, Modal } from '../components/ui'
import { AbsenceManager } from '../components/AbsenceManager'
import { CalendarFeed } from '../components/CalendarFeed'

const HERO_ROTATION = GALLERY.slice(0, 8)
const timeAgo = (sqlUtc: string) => {
  const minutes = Math.round((Date.now() - new Date(`${sqlUtc.replace(' ', 'T')}Z`).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`
  return `${Math.round(minutes / 1440)} d ago`
}

export function Home({ players, me, askIdentity, navigate, refreshPlayers, absences, refreshAbsences }: AppContext) {
  const [heroIndex, setHeroIndex] = useState(() => Math.floor(Math.random() * HERO_ROTATION.length))
  const [activity, setActivity] = useState<Activity[]>([])
  const [openSlot, setOpenSlot] = useState<number | null>(null)
  const [awayOpen, setAwayOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [from] = useState(() => currentSlot())
  const { schedule, bySlot, reload } = useSchedule(from, from + 14 * DAY)
  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players])

  useEffect(() => {
    const timer = window.setInterval(() => setHeroIndex((index) => (index + 1) % HERO_ROTATION.length), 7000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => { void api.activity().then(setActivity).catch(() => setActivity([])) }, [schedule])

  const hottest = useMemo(() => [...bySlot.entries()]
    .filter(([slot, signups]) => slot + HOUR > Date.now() && signups.length >= 2)
    .sort(([slotA, a], [slotB, b]) => b.length - a.length || slotA - slotB)
    .slice(0, 6), [bySlot])
  const upcomingSessions = schedule.sessions.filter((session) => session.slot + 2 * HOUR > Date.now()).slice(0, 5)
  const legends = [...players].sort((a, b) => (b.totalSignups ?? 0) - (a.totalSignups ?? 0)).slice(0, 3)
  const hero = HERO_ROTATION[heroIndex]
  const today = dayKey(new Date())
  const soon = dayKey(addDays(new Date(), 30))
  const outOfOffice = absences.filter((absence) => absence.end >= today && absence.start <= soon)

  return (
    <div className="home">
      <section className="hero">
        {HERO_ROTATION.map((painting, index) => (
          <div key={`${painting.champion}-${painting.skin}`} className={`hero-slide ${index === heroIndex ? 'on' : ''}`} style={{ backgroundImage: `url(${splash(painting.champion, painting.skin)})` }} />
        ))}
        <div className="hero-shade" />
        <div className="hero-content">
          <Crest size={132} />
          <p className="eyebrow">Est. in the Rift · Clan of {players.length} cowbuilder{players.length === 1 ? '' : 's'}</p>
          <h1 className="hero-title">Cowbuilders</h1>
          <p className="hero-tagline">Moo-ve together. Build together. Lose lane together.</p>
          <div className="hero-actions">
            <button type="button" className="button gold big" onClick={() => navigate('schedule')}>Plan the next game</button>
            {!me && <button type="button" className="button ghost big" onClick={askIdentity}>Join the herd</button>}
          </div>
        </div>
        <p className="hero-caption">{hero.title}</p>
      </section>

      <div className="home-grid">
        <section className="hextech-panel">
          <div className="panel-head">
            <h2>Locked sessions</h2>
            <button type="button" className="button small ghost" onClick={() => (me ? setCalendarOpen(true) : askIdentity())}>📅 Subscribe</button>
          </div>
          {upcomingSessions.length === 0 && <p className="muted">Nothing locked in yet. Find a slot with enough cowbuilders and hit 🔒 Lock in.</p>}
          <ul className="session-list">
            {upcomingSessions.map((session) => (
              <li key={session.id}>
                <button type="button" onClick={() => setOpenSlot(session.slot)}>
                  <span className="lock-badge">🔒 {MODE_INFO[session.mode].label}</span>
                  <strong>{session.title || formatSlot(session.slot)}</strong>
                  <span className="muted">{session.title ? formatSlot(session.slot) : ''} · {relative(session.slot)}</span>
                  <span className="mini-avatars">{(bySlot.get(session.slot) ?? []).map((signup) => { const player = playerById.get(signup.playerId); return player && <Avatar key={player.id} player={player} size={24} /> })}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="hextech-panel">
          <h2>Hottest slots</h2>
          {hottest.length === 0 && <p className="muted">No slot has two players yet in the next two weeks. Be the first moo.</p>}
          <ul className="hot-list">
            {hottest.map(([slot, signups]) => {
              const ready = allReadiness(candidatesOf(signups)).filter((item) => item.state === 'full' || item.state === 'ready')
              return (
                <li key={slot}>
                  <button type="button" onClick={() => setOpenSlot(slot)}>
                    <span className="hot-count">{signups.length}<small>/5</small></span>
                    <span className="hot-main">
                      <strong>{formatSlot(slot)}</strong>
                      <span className="muted">{relative(slot)} · {ready.map((item) => MODE_INFO[item.mode].short).join(' · ') || 'warming up'}</span>
                    </span>
                    <span className="mini-avatars">{signups.map((signup) => { const player = playerById.get(signup.playerId); return player && <Avatar key={player.id} player={player} size={24} /> })}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="hextech-panel">
          <h2>Herd chatter</h2>
          {activity.length === 0 && <p className="muted">Quiet in the barn.</p>}
          <ul className="activity">
            {activity.slice(0, 8).map((item, index) => {
              const player = item.playerId ? playerById.get(item.playerId) : undefined
              return (
                <li key={`${item.kind}-${item.slot}-${item.playerId}-${index}`}>
                  {player ? <Avatar player={player} size={24} /> : <Crest size={24} />}
                  <span>
                    <strong>{player?.name ?? 'Someone'}</strong>{' '}
                    {item.kind === 'session' ? <>locked in <em>{item.mode ? MODE_INFO[item.mode].label : 'a game'}</em> for</> : 'signed up for'} {formatSlot(item.slot)}
                  </span>
                  <span className="muted">{timeAgo(item.at)}</span>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="hextech-panel">
          <div className="panel-head">
            <h2>Out of office</h2>
            <button type="button" className="button small ghost" onClick={() => (me ? setAwayOpen(true) : askIdentity())}>🏖 I'm away</button>
          </div>
          {outOfOffice.length === 0 && <p className="muted">Everyone is around for the next 30 days. No excuses.</p>}
          <ul className="away-list">
            {outOfOffice.map((absence) => {
              const player = playerById.get(absence.playerId)
              const now = absence.start <= today
              return player && (
                <li key={absence.id} className={now ? 'now' : ''}>
                  <span className="away-avatar"><Avatar player={player} size={32} /></span>
                  <span>
                    <strong>{player.name}</strong> <span className="away-kind">{ABSENCE_KINDS[absence.kind].emoji} {ABSENCE_KINDS[absence.kind].label}</span><br />
                    <span className="muted">{now ? `back after ${formatDayKey(absence.end)}` : `${formatDayKey(absence.start)} – ${formatDayKey(absence.end)}`}{absence.note ? ` · ${absence.note}` : ''}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="hextech-panel">
          <h2>Hall of fame</h2>
          {legends.length === 0 && <p className="muted">No legends yet.</p>}
          <ol className="podium">
            {legends.map((player, index) => (
              <li key={player.id} style={{ backgroundImage: `linear-gradient(90deg, rgba(1,10,19,.95) 35%, rgba(1,10,19,.4)), url(${splash(player.champion)})` }}>
                <span className="podium-rank">{['🥇', '🥈', '🥉'][index]}</span>
                <Avatar player={player} size={40} />
                <span><strong>{player.name}</strong><br /><span className="muted">{player.totalSignups ?? 0} hours signed up</span></span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="gallery-section">
        <p className="eyebrow">The clan hall</p>
        <h2 className="section-title">Gallery of Legends</h2>
        <div className="gallery">
          {GALLERY.map((painting) => (
            <figure key={`${painting.champion}-${painting.skin}`} className="painting">
              <img src={splash(painting.champion, painting.skin)} alt={painting.title} loading="lazy" />
              <figcaption>{painting.title}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="rules hextech-panel">
        <h2>Clan code</h2>
        <ol>
          <li>Sign up when you can actually play. The calendar does not lie, and neither should you.</li>
          <li>Four people cannot queue Flex. Recruit a fifth or send someone to ARAM jail.</li>
          <li>Whoever locks in the session brings the good vibes. Tilt is left at the barn door.</li>
          <li>Nobody flames the jungler. The jungler knows what they did.</li>
          <li>Moo before every Baron. It is tradition.</li>
        </ol>
      </section>

      {calendarOpen && me && (
        <Modal title="Your calendar feed" onClose={() => setCalendarOpen(false)}>
          <CalendarFeed player={me} />
        </Modal>
      )}
      {awayOpen && me && (
        <Modal title="When are you away?" onClose={() => setAwayOpen(false)}>
          <AbsenceManager player={me} absences={absences} onChanged={refreshAbsences} />
        </Modal>
      )}
      {openSlot !== null && (
        <SlotDetail
          slot={openSlot} signups={bySlot.get(openSlot) ?? []} sessions={schedule.sessions.filter((session) => session.slot === openSlot)}
          players={players} me={me} absences={absences} askIdentity={askIdentity} onClose={() => setOpenSlot(null)}
          onChanged={async () => { await reload(); void refreshPlayers() }}
        />
      )}
    </div>
  )
}
