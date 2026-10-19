import type { Mode, Role } from './lol'

export type Player = {
  id: number; name: string; roles: Role[]; modes: Mode[]; champion: string; rank: string; motto: string
  createdAt: string; totalSignups?: number
}
export type Signup = { slot: number; playerId: number; roles: Role[]; modes: Mode[]; note: string; createdAt: string }
export type Session = { id: number; slot: number; mode: Mode; title: string; createdBy: number | null; createdAt: string }
export type Schedule = { signups: Signup[]; sessions: Session[] }
export type Activity = { kind: 'signup' | 'session'; slot: number; playerId: number | null; mode: Mode | null; at: string }
export type AbsenceKind = 'vacation' | 'exams' | 'work' | 'sick' | 'travel' | 'other'
export type Absence = { id: number; playerId: number; start: string; end: string; kind: AbsenceKind; note: string; createdAt: string }
export type PlayerInput = Pick<Player, 'name' | 'roles' | 'modes' | 'champion' | 'rank' | 'motto'>

const request = async <T,>(path: string, init?: { method?: string; body?: unknown }): Promise<T> => {
  const response = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: init?.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const payload = await response.json().catch(() => ({ error: `Server answered ${response.status}.` }))
  if (!response.ok) throw new Error(payload?.error ?? `Server answered ${response.status}.`)
  return payload as T
}

export const api = {
  players: () => request<Player[]>('/api/players'),
  createPlayer: (input: PlayerInput) => request<Player>('/api/players', { method: 'POST', body: input }),
  updatePlayer: (id: number, input: Partial<PlayerInput>) => request<Player>(`/api/players/${id}`, { method: 'PATCH', body: input }),
  deletePlayer: (id: number) => request<{ deleted: true }>(`/api/players/${id}`, { method: 'DELETE' }),
  schedule: (from: number, to: number) => request<Schedule>(`/api/schedule?from=${from}&to=${to}`),
  join: (body: { playerId: number; slots: number[]; roles?: Role[]; modes?: Mode[]; note?: string }) =>
    request<{ saved: number; full: number[] }>('/api/signups', { method: 'PUT', body }),
  leave: (playerId: number, slots: number[]) => request<{ removed: number }>('/api/signups', { method: 'DELETE', body: { playerId, slots } }),
  lockSession: (body: { slot: number; mode: Mode; title: string; createdBy: number | null }) => request<Session>('/api/sessions', { method: 'POST', body }),
  cancelSession: (id: number) => request<{ deleted: true }>(`/api/sessions/${id}`, { method: 'DELETE' }),
  absences: (since: string) => request<Absence[]>(`/api/absences?since=${since}`),
  addAbsence: (body: { playerId: number; start: string; end: string; kind: AbsenceKind; note: string }) => request<Absence>('/api/absences', { method: 'POST', body }),
  removeAbsence: (id: number) => request<{ deleted: true }>(`/api/absences/${id}`, { method: 'DELETE' }),
  activity: () => request<Activity[]>('/api/activity'),
}
