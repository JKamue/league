import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Player } from '../api'

/** Shows the player's secret, auto-updating .ics subscription link. */
export function CalendarFeed({ player }: { player: Player }) {
  const [path, setPath] = useState('')
  const [status, setStatus] = useState('')
  const url = path ? `${window.location.origin}${path}` : ''

  useEffect(() => {
    api.calendar(player.id).then((result) => setPath(result.path)).catch((reason: unknown) => setStatus(reason instanceof Error ? reason.message : 'Could not load the link.'))
  }, [player.id])

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setStatus('Link copied.') } catch { setStatus('Clipboard blocked, select the link and copy it by hand.') }
  }
  const regenerate = async () => {
    if (!window.confirm('Make a new link? The old one stops working and has to be removed from your calendar app.')) return
    try { setPath((await api.calendar(player.id, true)).path); setStatus('New link created.') } catch (reason) { setStatus(reason instanceof Error ? reason.message : 'Could not regenerate.') }
  }

  return (
    <div className="calendar-feed">
      <p className="muted">Subscribe once and {player.name}'s signed-up hours and locked sessions show up in your calendar, updating automatically as people join or leave.</p>
      <div className="feed-link">
        <input readOnly value={url || 'Loading…'} onFocus={(event) => event.target.select()} aria-label="Calendar link" />
        <button type="button" className="button gold" disabled={!url} onClick={() => void copy()}>Copy</button>
      </div>
      <ol className="feed-steps">
        <li><strong>Google Calendar</strong> (desktop): left sidebar, <em>Other calendars</em> → <em>+</em> → <em>From URL</em>, paste the link. Google refreshes it every few hours.</li>
        <li><strong>Apple / Outlook</strong>: <a href={url.replace(/^https?:/, 'webcal:')}>open as subscription</a>, or add it via “subscribe to calendar”.</li>
      </ol>
      <p className="muted small-print">The link is secret: anyone with it can see this calendar. If it leaks, make a new one.</p>
      {status && <p className="status">{status}</p>}
      <div className="actions"><button type="button" className="button small ghost danger" onClick={() => void regenerate()}>New link</button></div>
    </div>
  )
}
