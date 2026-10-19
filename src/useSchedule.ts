import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import type { Schedule, Signup } from './api'
import type { Candidate } from './lol'

const POLL_MS = 20_000

/** Signups and sessions in [from, to), refreshed while the tab is visible so everyone sees new joins. */
export function useSchedule(from: number, to: number) {
  const [schedule, setSchedule] = useState<Schedule>({ signups: [], sessions: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    try { setSchedule(await api.schedule(from, to)); setError('') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load the schedule.') } finally { setLoading(false) }
  }, [from, to])

  useEffect(() => {
    setLoading(true)
    void reload()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void reload() }, POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void reload() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [reload])

  const bySlot = useMemo(() => {
    const map = new Map<number, Signup[]>()
    schedule.signups.forEach((signup) => map.set(signup.slot, [...(map.get(signup.slot) ?? []), signup]))
    return map
  }, [schedule.signups])

  return { schedule, bySlot, loading, error, reload, setSchedule }
}

export const candidatesOf = (signups: Signup[]): Candidate[] => signups.map(({ playerId, roles, modes }) => ({ playerId, roles, modes }))
