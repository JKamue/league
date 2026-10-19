// League of Legends flavour: roles, queue rules, art from Riot's Data Dragon CDN and the lineup solver.

export const ROLES = ['top', 'jungle', 'mid', 'bot', 'support', 'fill'] as const
export type Role = (typeof ROLES)[number]
export const LANES = ROLES.filter((role): role is Exclude<Role, 'fill'> => role !== 'fill')
export type Lane = (typeof LANES)[number]

export const ROLE_LABEL: Record<Role, string> = { top: 'Top', jungle: 'Jungle', mid: 'Mid', bot: 'Bot', support: 'Support', fill: 'Fill' }
const ROLE_ICON_NAME: Record<Role, string> = { top: 'top', jungle: 'jungle', mid: 'middle', bot: 'bottom', support: 'utility', fill: 'fill' }
export const roleIcon = (role: Role) =>
  `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-${ROLE_ICON_NAME[role]}.png`

export const MODES = ['flex', 'aram', 'normal', 'clash', 'arena', 'duo'] as const
export type Mode = (typeof MODES)[number]
export const MODE_INFO: Record<Mode, { label: string; short: string; blurb: string }> = {
  flex: { label: 'Ranked Flex', short: 'Flex', blurb: 'Queue as 1, 2, 3 or 5. Four is the forbidden number.' },
  aram: { label: 'ARAM', short: 'ARAM', blurb: 'Howling Abyss, any group size. Snowball at your own risk.' },
  normal: { label: 'Normal Draft', short: 'Normal', blurb: 'Any group size, best with a full five.' },
  clash: { label: 'Clash', short: 'Clash', blurb: 'Exactly five, every lane covered.' },
  arena: { label: 'Arena', short: 'Arena', blurb: '2v2v2v2: duos only. Four makes two teams.' },
  duo: { label: 'Ranked Solo/Duo', short: 'Duo', blurb: 'Exactly two. Pray for your ADC.' },
}

export const DDRAGON = 'https://ddragon.leagueoflegends.com/cdn'
export const splash = (champion: string, skin = 0) => `${DDRAGON}/img/champion/splash/${champion}_${skin}.jpg`
export const centered = (champion: string, skin = 0) => `${DDRAGON}/img/champion/centered/${champion}_${skin}.jpg`
export const tile = (champion: string, skin = 0) => `${DDRAGON}/img/champion/tiles/${champion}_${skin}.jpg`

// The paintings hanging in the clan hall. Alistar (a cow) and Ornn (a builder) are the house gods.
export const GALLERY: { champion: string; skin: number; title: string }[] = [
  { champion: 'Alistar', skin: 10, title: 'Moo Cow Alistar, patron saint' },
  { champion: 'Ornn', skin: 0, title: 'Ornn, master builder' },
  { champion: 'Jinx', skin: 0, title: 'Jinx, demolition department' },
  { champion: 'Thresh', skin: 0, title: 'Thresh, recruitment office' },
  { champion: 'Aatrox', skin: 0, title: 'Aatrox, motivational speaker' },
  { champion: 'LeeSin', skin: 0, title: 'Lee Sin, blind scheduling' },
  { champion: 'Jayce', skin: 0, title: 'Jayce, hammer enjoyer' },
  { champion: 'Heimerdinger', skin: 0, title: 'Heimerdinger, turret contractor' },
  { champion: 'Braum', skin: 0, title: 'Braum, door installation' },
  { champion: 'Vi', skin: 0, title: 'Vi, structural integrity tests' },
  { champion: 'Poppy', skin: 0, title: 'Poppy, hammer apprentice' },
  { champion: 'Sett', skin: 0, title: 'Sett, the boss' },
  { champion: 'Ekko', skin: 0, title: 'Ekko, time management' },
  { champion: 'Illaoi', skin: 0, title: 'Illaoi, team spirit' },
  { champion: 'Garen', skin: 0, title: 'Garen, spin to win' },
  { champion: 'Ahri', skin: 0, title: 'Ahri, charm offensive' },
  { champion: 'Darius', skin: 0, title: 'Darius, team discipline' },
  { champion: 'Lux', skin: 0, title: 'Lux, lighting design' },
  { champion: 'Viego', skin: 0, title: 'Viego, emotional damage' },
  { champion: 'Yasuo', skin: 0, title: 'Yasuo, 0/10 powerspike' },
  { champion: 'Alistar', skin: 0, title: 'Alistar, the original' },
]

export type Champion = { id: string; name: string }
let championsPromise: Promise<Champion[]> | null = null
export const loadChampions = () => {
  championsPromise ??= fetch('https://ddragon.leagueoflegends.com/api/versions.json')
    .then((response) => response.json() as Promise<string[]>)
    .then((versions) => fetch(`${DDRAGON}/${versions[0]}/data/en_US/champion.json`))
    .then((response) => response.json() as Promise<{ data: Record<string, { id: string; name: string }> }>)
    .then((json) => Object.values(json.data).map(({ id, name }) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)))
    .catch(() => { championsPromise = null; return [] })
  return championsPromise
}

export type Candidate = { playerId: number; roles: Role[]; modes: Mode[] }
export type Lineup = { assignment: Partial<Record<Lane, number>>; covered: number; cost: number }

// Each player's listed roles cost their position in the list; "fill" makes every other lane cost 3.
const roleCost = (candidate: Candidate, lane: Lane) => {
  const index = candidate.roles.indexOf(lane)
  if (index >= 0) return index
  return candidate.roles.includes('fill') ? 3 : Infinity
}

/** Best assignment of players to lanes: cover as many lanes as possible, then honour preferences. */
export const solveLineup = (candidates: Candidate[]): Lineup => {
  let best: Lineup = { assignment: {}, covered: 0, cost: 0 }
  const walk = (index: number, used: Set<Lane>, assignment: Partial<Record<Lane, number>>, cost: number) => {
    if (index === candidates.length) {
      const covered = used.size
      if (covered > best.covered || (covered === best.covered && cost < best.cost)) best = { assignment: { ...assignment }, covered, cost }
      return
    }
    const candidate = candidates[index]
    for (const lane of LANES) {
      const laneCost = roleCost(candidate, lane)
      if (used.has(lane) || laneCost === Infinity) continue
      used.add(lane); assignment[lane] = candidate.playerId
      walk(index + 1, used, assignment, cost + laneCost)
      used.delete(lane); delete assignment[lane]
    }
    walk(index + 1, used, assignment, cost) // this player could also sit this one out of the lineup
  }
  walk(0, new Set(), {}, 0)
  return best
}

export type Readiness = { mode: Mode; state: 'full' | 'ready' | 'close' | 'no'; note: string; count: number }

/** Can the players in a slot actually queue for a mode? Only counts players who are up for that mode. */
export const readiness = (mode: Mode, everyone: Candidate[]): Readiness => {
  const players = everyone.filter((candidate) => candidate.modes.includes(mode))
  const count = players.length
  const result = (state: Readiness['state'], note: string): Readiness => ({ mode, state, note, count })
  switch (mode) {
    case 'flex':
      if (count === 5) return solveLineup(players).covered === 5 ? result('full', 'Full 5-stack, all lanes covered') : result('ready', '5 stack, lanes are messy')
      if (count === 4) return result('close', 'Four cannot queue Flex, find a fifth or drop one')
      if (count >= 2) return result('ready', `${count}-stack can queue`)
      return result(count === 1 ? 'close' : 'no', count === 1 ? 'Solo in Flex? Get a buddy' : 'Nobody yet')
    case 'aram':
      if (count === 5) return result('full', 'Full ARAM premade')
      if (count >= 2) return result('ready', `${count} ready, ${5 - count} randoms`)
      return result(count === 1 ? 'close' : 'no', count === 1 ? 'One more for a duo ARAM' : 'Nobody yet')
    case 'normal':
      if (count === 5) return solveLineup(players).covered === 5 ? result('full', 'Full draft, all lanes covered') : result('ready', 'Five players, lanes overlap')
      if (count >= 2) return result('ready', `${count} ready`)
      return result(count === 1 ? 'close' : 'no', count === 1 ? 'Need one more' : 'Nobody yet')
    case 'clash': {
      if (count < 4) return result('no', `${count}/5, need full team`)
      const covered = solveLineup(players).covered
      if (count === 5 && covered === 5) return result('full', 'Clash team locked: every lane covered')
      if (count === 5) return result('close', `Five players but only ${covered}/5 lanes covered`)
      return result('close', 'One more for Clash')
    }
    case 'arena':
      if (count >= 4) return result('full', count === 4 ? 'Two Arena duos' : 'Two duos + one on the bench')
      if (count >= 2) return result('ready', count === 2 ? 'One Arena duo' : 'One duo, one more for a second')
      return result(count === 1 ? 'close' : 'no', count === 1 ? 'Need a partner' : 'Nobody yet')
    case 'duo':
      if (count === 2) return result('ready', 'Perfect duo')
      if (count > 2) return result('ready', `${count} players, pick a duo`)
      return result(count === 1 ? 'close' : 'no', count === 1 ? 'Need a duo partner' : 'Nobody yet')
  }
}

export const allReadiness = (candidates: Candidate[]) => MODES.map((mode) => readiness(mode, candidates))
