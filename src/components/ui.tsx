import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Player } from '../api'
import { MODE_INFO, MODES, ROLE_LABEL, ROLES, loadChampions, roleIcon, tile } from '../lol'
import type { Champion, Mode, Role } from '../lol'

export function Crest({ size = 64 }: { size?: number }) {
  return (
    <svg className="crest" width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Cowbuilders crest">
      <defs>
        <linearGradient id="crest-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0e6d2" /><stop offset="0.45" stopColor="#c8aa6e" /><stop offset="1" stopColor="#785a28" />
        </linearGradient>
        <linearGradient id="crest-blue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a323c" /><stop offset="1" stopColor="#010a13" />
        </linearGradient>
      </defs>
      {/* shield */}
      <path d="M60 4 L108 22 V58 C108 86 88 104 60 116 C32 104 12 86 12 58 V22 Z" fill="url(#crest-blue)" stroke="url(#crest-gold)" strokeWidth="5" />
      {/* crossed hammers behind the head */}
      <g stroke="url(#crest-gold)" strokeWidth="5" strokeLinecap="round">
        <line x1="28" y1="96" x2="88" y2="36" /><line x1="92" y1="96" x2="32" y2="36" />
      </g>
      <g fill="url(#crest-gold)">
        <rect x="76" y="22" width="24" height="12" rx="2" transform="rotate(45 88 28)" />
        <rect x="20" y="22" width="24" height="12" rx="2" transform="rotate(-45 32 28)" />
      </g>
      {/* horns */}
      <path d="M38 50 C24 46 20 32 26 22 C30 34 36 38 46 42 Z" fill="#f0e6d2" stroke="#785a28" strokeWidth="2" />
      <path d="M82 50 C96 46 100 32 94 22 C90 34 84 38 74 42 Z" fill="#f0e6d2" stroke="#785a28" strokeWidth="2" />
      {/* head */}
      <path d="M42 42 C42 34 78 34 78 42 L76 70 C76 78 70 82 60 82 C50 82 44 78 44 70 Z" fill="#f0e6d2" stroke="#785a28" strokeWidth="2.5" />
      <ellipse cx="36" cy="50" rx="8" ry="4.5" fill="#f0e6d2" stroke="#785a28" strokeWidth="2" transform="rotate(20 36 50)" />
      <ellipse cx="84" cy="50" rx="8" ry="4.5" fill="#f0e6d2" stroke="#785a28" strokeWidth="2" transform="rotate(-20 84 50)" />
      <path d="M50 40 C56 48 52 56 46 54" fill="#1e2328" opacity="0.85" />
      <circle cx="52" cy="56" r="3.2" fill="#010a13" /><circle cx="68" cy="56" r="3.2" fill="#010a13" />
      <circle cx="53" cy="55" r="1" fill="#0ac8b9" /><circle cx="69" cy="55" r="1" fill="#0ac8b9" />
      {/* snout with nose ring */}
      <ellipse cx="60" cy="72" rx="13" ry="9" fill="#d8a9a0" stroke="#785a28" strokeWidth="2" />
      <circle cx="55" cy="72" r="2" fill="#5b2b2b" /><circle cx="65" cy="72" r="2" fill="#5b2b2b" />
      <path d="M54 78 A6 6 0 0 0 66 78" fill="none" stroke="url(#crest-gold)" strokeWidth="3" />
    </svg>
  )
}

export function RoleIcon({ role, size = 20 }: { role: Role; size?: number }) {
  return <img className="role-icon" src={roleIcon(role)} width={size} height={size} alt={ROLE_LABEL[role]} title={ROLE_LABEL[role]} loading="lazy" />
}

export function Avatar({ player, size = 36 }: { player: Pick<Player, 'champion' | 'name'>; size?: number }) {
  return <img className="avatar" src={tile(player.champion)} width={size} height={size} alt="" title={player.name} loading="lazy" />
}

/** Ordered role preference: click to add in order, click again to remove. */
export function RolePicker({ value, onChange }: { value: Role[]; onChange: (roles: Role[]) => void }) {
  const toggle = (role: Role) => onChange(value.includes(role) ? value.filter((item) => item !== role) : [...value, role])
  return (
    <div className="chip-row" role="group" aria-label="Preferred roles">
      {ROLES.map((role) => {
        const rank = value.indexOf(role)
        return (
          <button type="button" key={role} className={`chip role-chip ${rank >= 0 ? 'on' : ''}`} aria-pressed={rank >= 0} onClick={() => toggle(role)}>
            <RoleIcon role={role} size={18} /> {ROLE_LABEL[role]}
            {rank >= 0 && <span className="chip-rank">{rank + 1}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function ModePicker({ value, onChange }: { value: Mode[]; onChange: (modes: Mode[]) => void }) {
  const toggle = (mode: Mode) => onChange(value.includes(mode) ? value.filter((item) => item !== mode) : MODES.filter((item) => item === mode || value.includes(item)))
  return (
    <div className="chip-row" role="group" aria-label="Game modes">
      {MODES.map((mode) => (
        <button type="button" key={mode} className={`chip ${value.includes(mode) ? 'on' : ''}`} aria-pressed={value.includes(mode)} onClick={() => toggle(mode)} title={MODE_INFO[mode].blurb}>
          {MODE_INFO[mode].short}
        </button>
      ))}
    </div>
  )
}

export function ChampionPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [champions, setChampions] = useState<Champion[]>([])
  useEffect(() => { void loadChampions().then(setChampions) }, [])
  if (champions.length === 0) return <input value={value} onChange={(event) => onChange(event.target.value.replace(/[^A-Za-z0-9]/g, ''))} placeholder="Alistar" />
  return (
    <div className="champion-picker">
      <img src={tile(value || 'Alistar')} alt="" width={40} height={40} />
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {champions.map((champion) => <option key={champion.id} value={champion.id}>{champion.name}</option>)}
      </select>
    </div>
  )
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className={`modal hextech-frame ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">✕</button>
        </header>
        {children}
      </section>
    </div>
  )
}

export function LaneSummary({ roles }: { roles: Role[] }) {
  return <span className="lane-summary">{roles.map((role) => <RoleIcon key={role} role={role} size={16} />)}</span>
}

