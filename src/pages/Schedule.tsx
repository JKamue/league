import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { AppContext } from '../App'
import { api } from '../api'
import { MODE_INFO, allReadiness, splash } from '../lol'
import type { Mode, Readiness } from '../lol'
import { ALL_HOURS, DAY, EVENING_HOURS, HOUR, addDays, formatDay, formatRange, gamingDayOf, isSameDay, slotFor, startOfWeek, weekDays } from '../time'
import { candidatesOf, useSchedule } from '../useSchedule'
import { SlotDetail } from '../components/SlotDetail'
import { ABSENCE_KINDS, awayOn, describeAbsence, isAway } from '../absence'
import { AbsenceManager } from '../components/AbsenceManager'
import { Avatar, Crest, Modal } from '../components/ui'

const HOURS_KEY = 'cowbuilders:hours'
// Which badge a cell shows: the most demanding mode the group can actually play.
const BADGE_ORDER: Mode[] = ['clash', 'flex', 'normal', 'aram', 'arena', 'duo']
const bestBadge = (items: Readiness[]) => {
  for (const state of ['full', 'ready'] as const) {
    const hit = BADGE_ORDER.map((mode) => items.find((item) => item.mode === mode)!).find((item) => item.state === state)
    if (hit) return hit
  }
  return null
}
type Paint = { action: 'add' | 'remove'; slots: Set<number> }
// Deep link: /schedule?slot=<ms> opens that slot, so Discord messages can point straight at a lobby.
const linkedSlot = () => { const slot = Number(new URLSearchParams(window.location.search).get('slot')); return Number.isSafeInteger(slot) && slot > 0 ? slot : null }

export function SchedulePage({ players, me, askIdentity, refreshPlayers, absences, refreshAbsences }: AppContext) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(linkedSlot() ? gamingDayOf(linkedSlot()!) : new Date()))
  const [showAll, setShowAll] = useState(() => { try { return localStorage.getItem(HOURS_KEY) === 'all' } catch { return false } })
  const [paintMode, setPaintMode] = useState(false)
  const [paint, setPaint] = useState<Paint | null>(null)
  const [openSlot, setOpenSlotState] = useState<number | null>(linkedSlot)
  const setOpenSlot = (slot: number | null) => {
    setOpenSlotState(slot)
    window.history.replaceState(null, '', slot === null ? '/schedule' : `/schedule?slot=${slot}`)
  }
  const [filter, setFilter] = useState<Mode | 'any'>('any')
  const [toast, setToast] = useState('')
  const [awayOpen, setAwayOpen] = useState(false)
  const paintRef = useRef<Paint | null>(null)

  const days = weekDays(weekStart)
  const hours = showAll ? ALL_HOURS : EVENING_HOURS
  const from = weekStart.getTime()
  const to = addDays(weekStart, 8).getTime()
  const { schedule, bySlot, error, reload } = useSchedule(from, to)
  const playerById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players])
  const sessionsBySlot = useMemo(() => {
    const map = new Map<number, typeof schedule.sessions>()
    schedule.sessions.forEach((session) => map.set(session.slot, [...(map.get(session.slot) ?? []), session]))
    return map
  }, [schedule.sessions])
  const now = Date.now()
  const myHours = me ? schedule.signups.filter((signup) => signup.playerId === me.id && signup.slot >= from && signup.slot < from + 7 * DAY).length : 0

  useEffect(() => { try { localStorage.setItem(HOURS_KEY, showAll ? 'all' : 'evening') } catch { /* ignore */ } }, [showAll])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 3500); return () => window.clearTimeout(timer) }, [toast])

  // Painting: press on a cell, drag across others, release to join (or leave) all of them at once.
  const startPaint = (slot: number, event: ReactPointerEvent) => {
    if (!paintMode || slot + HOUR < now) return
    if (!me) { askIdentity(); return }
    event.preventDefault()
    const inSlot = (bySlot.get(slot) ?? []).some((signup) => signup.playerId === me.id)
    paintRef.current = { action: inSlot ? 'remove' : 'add', slots: new Set([slot]) }
    setPaint({ ...paintRef.current })
  }
  const movePaint = (event: ReactPointerEvent) => {
    if (!paintRef.current) return
    const cell = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-slot]')
    const slot = Number(cell?.dataset.slot)
    if (!slot || slot + HOUR < now || paintRef.current.slots.has(slot)) return
    paintRef.current.slots.add(slot)
    setPaint({ ...paintRef.current, slots: new Set(paintRef.current.slots) })
  }
  useEffect(() => {
    const finish = async () => {
      const current = paintRef.current
      paintRef.current = null
      if (!current || !me) return
      // You can't be available on days you marked yourself away, so painting skips them.
      const slots = [...current.slots].filter((slot) => current.action === 'remove' || !isAway(absences, me.id, gamingDayOf(slot)))
      const skipped = current.slots.size - slots.length
      const skippedNote = skipped ? ` Skipped ${skipped} on days you're away.` : ''
      try {
        if (slots.length === 0) { setToast(`You're marked away on those days.`); return }
        if (current.action === 'add') {
          const result = await api.join({ playerId: me.id, slots })
          setToast((result.full.length ? `Joined ${result.saved} slot(s); ${result.full.length} already full.` : `Joined ${result.saved} slot${result.saved === 1 ? '' : 's'}.`) + skippedNote)
        } else {
          const result = await api.leave(me.id, slots)
          setToast(`Left ${result.removed} slot${result.removed === 1 ? '' : 's'}.`)
        }
        await reload()
        void refreshPlayers()
      } catch (reason) { setToast(reason instanceof Error ? reason.message : 'Could not save.') } finally { setPaint(null) }
    }
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => { window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish) }
  }, [me, reload, refreshPlayers, absences])

  const copyWeek = async () => {
    if (!me) return askIdentity()
    const lastWeek = await api.schedule(from - 7 * DAY, from)
    const source = lastWeek.signups.filter((signup) => signup.playerId === me.id)
    if (!source.length) return setToast('You had no signups last week to copy.')
    const future = source.map((signup) => signup.slot + 7 * DAY).filter((slot) => slot + HOUR >= Date.now())
    if (!future.length) return setToast('Nothing left to copy for this week.')
    const result = await api.join({ playerId: me.id, slots: future })
    setToast(`Copied ${result.saved} slot${result.saved === 1 ? '' : 's'} from last week.`)
    await reload()
  }

  const openSignups = openSlot === null ? [] : bySlot.get(openSlot) ?? []
  const backdrop = splash('Alistar', 10)

  return (
    <div className="schedule-page" style={{ '--backdrop': `url(${backdrop})` } as React.CSSProperties}>
      <section className="page-head">
        <div>
          <p className="eyebrow">War Room</p>
          <h1>Schedule</h1>
          <p className="muted">{paintMode ? 'Paint mode: press and drag over the hours you can play. Drag over your own slots to remove them.' : 'Click a slot to see the lobby, join with your roles, or lock in a game.'}</p>
        </div>
        <div className="head-stats">
          <div><strong>{myHours}</strong><span>your hours this week</span></div>
        </div>
      </section>

      <div className="toolbar hextech-panel">
        <div className="week-nav">
          <button type="button" className="icon-button" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">‹</button>
          <button type="button" className="button small ghost" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</button>
          <button type="button" className="icon-button" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">›</button>
          <strong className="week-label">{formatRange(weekStart)}</strong>
        </div>
        <div className="toolbar-actions">
          <button type="button" className={`button small ${paintMode ? 'gold' : 'ghost'}`} aria-pressed={paintMode} onClick={() => setPaintMode(!paintMode)}>🖌 Paint availability</button>
          <button type="button" className="button small ghost" onClick={() => void copyWeek()}>⟳ Copy my last week</button>
          <button type="button" className="button small ghost" onClick={() => (me ? setAwayOpen(true) : askIdentity())}>🏖 I'm away</button>
          <button type="button" className="button small ghost" onClick={() => setShowAll(!showAll)}>{showAll ? 'Evenings only' : 'All day'}</button>
          <select value={filter} onChange={(event) => setFilter(event.target.value as Mode | 'any')} aria-label="Highlight mode">
            <option value="any">Highlight: any mode</option>
            {(Object.keys(MODE_INFO) as Mode[]).map((mode) => <option key={mode} value={mode}>Highlight: {MODE_INFO[mode].label}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="banner error">⚠ {error}</div>}

      <div className="calendar-scroll">
        <div className={`calendar ${paintMode ? 'painting' : ''}`} style={{ gridTemplateColumns: `4.2rem repeat(7, minmax(7.5rem, 1fr))` }} onPointerMove={movePaint}>
          <div className="corner"><Crest size={30} /></div>
          {days.map((day) => (
            <div key={day.toISOString()} className={`day-head ${isSameDay(day, new Date()) ? 'today' : ''}`}>
              {formatDay(day)}
              {awayOn(absences, day).length > 0 && (
                <span className="day-away">
                  {awayOn(absences, day).map((absence) => {
                    const player = playerById.get(absence.playerId)
                    return player && <span key={absence.id} className="away-tag" title={`${player.name}: ${describeAbsence(absence)}`}>{ABSENCE_KINDS[absence.kind].emoji} <s>{player.name}</s></span>
                  })}
                </span>
              )}
            </div>
          ))}
          {hours.map(renderRow)}
        </div>
      </div>

      <div className="legend">
        <span><i className="heat heat-1" />1</span><span><i className="heat heat-2" />2</span><span><i className="heat heat-3" />3</span>
        <span><i className="heat heat-4" />4</span><span><i className="heat heat-5" />5 full</span>
        <span className="legend-mine">your slot</span><span><i className="legend-away" />you are away</span><span>🔒 locked session</span>
        <span className="muted">Times in your local time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Night hours count to the evening before.</span>
      </div>

      {openSlot !== null && (
        <SlotDetail
          slot={openSlot} signups={openSignups} sessions={sessionsBySlot.get(openSlot) ?? []} players={players} me={me} absences={absences}
          askIdentity={askIdentity} onClose={() => setOpenSlot(null)} onChanged={async () => { await reload(); void refreshPlayers() }}
        />
      )}
      {awayOpen && me && (
        <Modal title="When are you away?" onClose={() => setAwayOpen(false)}>
          <AbsenceManager player={me} absences={absences} onChanged={refreshAbsences} />
        </Modal>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )

  function renderRow(hour: number) {
    return (
      <Fragment key={hour}>
        <div className="hour-label">{String(hour).padStart(2, '0')}:00</div>
        {days.map((day) => {
          const slot = slotFor(day, hour)
          const signups = bySlot.get(slot) ?? []
          const candidates = candidatesOf(signups)
          const readiness = allReadiness(candidates)
          const badge = filter === 'any' ? bestBadge(readiness) : readiness.find((item) => item.mode === filter && (item.state === 'full' || item.state === 'ready')) ?? null
          const sessions = sessionsBySlot.get(slot) ?? []
          const mine = me ? signups.some((signup) => signup.playerId === me.id) : false
          const meAway = me ? isAway(absences, me.id, day) : false
          const painted = paint?.slots.has(slot)
          const classes = ['cell', `heat-${signups.length}`, slot + HOUR < now ? 'past' : '', slot <= now && now < slot + HOUR ? 'now' : '', mine ? 'mine' : '', meAway ? 'away-me' : '',
            painted ? `paint-${paint!.action}` : '', badge ? `badge-${badge.state}` : '', filter !== 'any' && !badge && signups.length ? 'dim' : '']
          return (
            <button
              type="button" key={slot} data-slot={slot} className={classes.filter(Boolean).join(' ')}
              onPointerDown={(event) => startPaint(slot, event)}
              onClick={() => { if (!paintMode) setOpenSlot(slot) }}
              aria-label={`${formatDay(day)} ${hour}:00, ${signups.length} of 5 signed up`}
            >
              {sessions.length > 0 && <span className="cell-lock" title={sessions.map((session) => MODE_INFO[session.mode].label).join(', ')}>🔒 {MODE_INFO[sessions[0].mode].short}</span>}
              <span className="cell-avatars">
                {signups.map((signup) => { const player = playerById.get(signup.playerId); return player ? <Avatar key={signup.playerId} player={player} size={18} /> : null })}
              </span>
              <span className="cell-foot">
                {signups.length > 0 && <span className="cell-count">{signups.length}/5</span>}
                {badge && <span className={`cell-badge ${badge.state}`}>{MODE_INFO[badge.mode].short}</span>}
              </span>
            </button>
          )
        })}
      </Fragment>
    )
  }
}
