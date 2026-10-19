import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api'
import type { Player } from '../api'
import { MODES } from '../lol'
import type { Mode, Role } from '../lol'
import { ChampionPicker, ModePicker, RolePicker } from './ui'

const RANKS = ['', 'Unranked', 'Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Master', 'Grandmaster', 'Challenger']

export function PlayerForm({ player, onSaved, onCancel, submitLabel = 'Save' }: {
  player?: Player; onSaved: (player: Player) => void | Promise<void>; onCancel?: () => void; submitLabel?: string
}) {
  const [name, setName] = useState(player?.name ?? '')
  const [roles, setRoles] = useState<Role[]>(player?.roles ?? ['fill'])
  const [modes, setModes] = useState<Mode[]>(player?.modes ?? [...MODES])
  const [champion, setChampion] = useState(player?.champion ?? 'Alistar')
  const [rank, setRank] = useState(player?.rank ?? '')
  const [motto, setMotto] = useState(player?.motto ?? '')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (roles.length === 0) return setStatus('Pick at least one role (Fill counts).')
    setBusy(true)
    try {
      const input = { name, roles, modes, champion, rank, motto }
      await onSaved(player ? await api.updatePlayer(player.id, input) : await api.createPlayer(input))
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'Could not save.')
    } finally { setBusy(false) }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>Summoner name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={32} required autoFocus placeholder="xX_MooMaster_Xx" /></label>
      <div className="field"><span>Preferred roles <small>(in order)</small></span><RolePicker value={roles} onChange={setRoles} /></div>
      <div className="field"><span>Usually up for</span><ModePicker value={modes} onChange={setModes} /></div>
      <div className="form-row">
        <div className="field"><span>Signature champion</span><ChampionPicker value={champion} onChange={setChampion} /></div>
        <label>Rank<select value={rank} onChange={(event) => setRank(event.target.value)}>{RANKS.map((item) => <option key={item} value={item}>{item || '—'}</option>)}</select></label>
      </div>
      <label>Battle cry<input value={motto} onChange={(event) => setMotto(event.target.value)} maxLength={140} placeholder="It's not a throw if you never had the lead." /></label>
      {status && <p className="form-error">{status}</p>}
      <div className="actions">
        {onCancel && <button type="button" className="button ghost" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="button" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  )
}
