import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import type { Absence, Player } from './api'
import { currentAbsence, dayKey } from './absence'
import { addDays } from './time'
import { Avatar, Crest, Modal } from './components/ui'
import { PlayerForm } from './components/PlayerForm'
import { CalendarFeed } from './components/CalendarFeed'
import { Home } from './pages/Home'
import { SchedulePage } from './pages/Schedule'
import { Roster } from './pages/Roster'
import { AramCodex } from './pages/AramCodex'

export type Page = 'home' | 'schedule' | 'roster' | 'codex'
const PATHS: Record<Page, string> = { home: '/', schedule: '/schedule', roster: '/roster', codex: '/aram-kodex' }
const pageFromPath = (path: string): Page => (path.startsWith('/schedule') ? 'schedule' : path.startsWith('/roster') ? 'roster' : path.startsWith('/aram-kodex') ? 'codex' : 'home')
const ME_KEY = 'cowbuilders:me'
const readMe = () => { try { return Number(localStorage.getItem(ME_KEY)) || null } catch { return null } }

export type AppContext = {
  players: Player[]
  me: Player | null
  refreshPlayers: () => Promise<void>
  absences: Absence[]
  refreshAbsences: () => Promise<void>
  askIdentity: () => void
  navigate: (page: Page) => void
}

export default function App() {
  const [page, setPage] = useState<Page>(() => pageFromPath(window.location.pathname))
  const [players, setPlayers] = useState<Player[]>([])
  const [meId, setMeId] = useState<number | null>(readMe)
  const [identityOpen, setIdentityOpen] = useState(false)
  const [error, setError] = useState('')
  const [absences, setAbsences] = useState<Absence[]>([])
  const me = players.find((player) => player.id === meId) ?? null

  const refreshPlayers = useCallback(async () => {
    try { setPlayers(await api.players()); setError('') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Server unreachable.') }
  }, [])
  useEffect(() => { void refreshPlayers() }, [refreshPlayers])
  // A year back is plenty for browsing old weeks; the list stays tiny.
  const refreshAbsences = useCallback(async () => {
    try { setAbsences(await api.absences(dayKey(addDays(new Date(), -365)))) } catch { /* the players error banner already covers an unreachable server */ }
  }, [])
  useEffect(() => {
    void refreshAbsences()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshAbsences() }, 60_000)
    return () => window.clearInterval(timer)
  }, [refreshAbsences])
  useEffect(() => {
    const onPop = () => setPage(pageFromPath(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((next: Page) => {
    if (window.location.pathname !== PATHS[next]) window.history.pushState(null, '', PATHS[next])
    setPage(next)
    window.scrollTo({ top: 0 })
  }, [])
  const chooseMe = (id: number | null) => {
    setMeId(id)
    try { if (id) localStorage.setItem(ME_KEY, String(id)); else localStorage.removeItem(ME_KEY) } catch { /* private mode: identity just isn't remembered */ }
    setIdentityOpen(false)
  }
  const context: AppContext = { players, me, refreshPlayers, absences, refreshAbsences, askIdentity: () => setIdentityOpen(true), navigate }

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate('home') }}>
          <Crest size={42} />
          <span className="brand-name">Cowbuilders</span>
        </a>
        <nav className="nav">
          {(['home', 'schedule', 'roster'] as Page[]).map((item) => (
            <a key={item} href={PATHS[item]} className={page === item ? 'active' : ''} onClick={(event) => { event.preventDefault(); navigate(item) }}>
              {item === 'home' ? 'Hall' : item === 'schedule' ? 'Schedule' : 'Roster'}
            </a>
          ))}
        </nav>
        <a href={PATHS.codex} className={`codex-link ${page === 'codex' ? 'active' : ''}`} onClick={(event) => { event.preventDefault(); navigate('codex') }}>
          <span aria-hidden="true">⚖</span> ARAM-Kodex
        </a>
        <button type="button" className="me-button" onClick={() => setIdentityOpen(true)}>
          {me ? <><Avatar player={me} size={28} /><span>{me.name}</span>{currentAbsence(absences, me.id) && <span title="You are marked as away today">🏖</span>}</> : <span>Who are you?</span>}
        </button>
      </header>

      {error && <div className="banner error">⚠ {error} <button type="button" onClick={() => void refreshPlayers()}>Retry</button></div>}

      <main>
        {page === 'home' && <Home {...context} />}
        {page === 'schedule' && <SchedulePage {...context} />}
        {page === 'roster' && <Roster {...context} />}
        {page === 'codex' && <AramCodex />}
      </main>

      <footer className="footer">
        <Crest size={32} />
        <p><strong>Cowbuilders</strong> · Moo-ve together, build together.</p>
        <p className="legal">
          Cowbuilders HQ isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing
          Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc. Champion art via Data Dragon, role icons via CommunityDragon.
        </p>
      </footer>

      {identityOpen && (
        <Modal title="Who's queuing up?" onClose={() => setIdentityOpen(false)}>
          <IdentityPicker players={players} meId={meId} onPick={chooseMe} onCreated={async (player) => { await refreshPlayers(); chooseMe(player.id) }} />
        </Modal>
      )}
    </div>
  )
}

function IdentityPicker({ players, meId, onPick, onCreated }: { players: Player[]; meId: number | null; onPick: (id: number | null) => void; onCreated: (player: Player) => Promise<void> }) {
  const [creating, setCreating] = useState(players.length === 0)
  const [showCalendar, setShowCalendar] = useState(false)
  const me = players.find((player) => player.id === meId)
  if (showCalendar && me) return <><CalendarFeed player={me} /><div className="actions"><button type="button" className="button ghost" onClick={() => setShowCalendar(false)}>Back</button></div></>
  if (creating) return <PlayerForm onSaved={onCreated} onCancel={players.length ? () => setCreating(false) : undefined} submitLabel="Join the herd" />
  return (
    <div className="identity">
      <p className="muted">Pick yourself. This is remembered in this browser only, no passwords, we trust each other (mostly).</p>
      <div className="identity-grid">
        {players.map((player) => (
          <button type="button" key={player.id} className={`identity-card ${player.id === meId ? 'on' : ''}`} onClick={() => onPick(player.id)}>
            <Avatar player={player} size={56} />
            <span>{player.name}</span>
          </button>
        ))}
      </div>
      <div className="actions">
        <button type="button" className="button ghost" onClick={() => setCreating(true)}>+ I'm new here</button>
        {me && <button type="button" className="button ghost" onClick={() => setShowCalendar(true)}>📅 My calendar</button>}
        {meId && <button type="button" className="button ghost" onClick={() => onPick(null)}>Log out</button>}
      </div>
    </div>
  )
}
