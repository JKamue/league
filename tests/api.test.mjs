import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const port = 3900 + Math.floor(Math.random() * 90)
const base = `http://127.0.0.1:${port}`
const dataDir = mkdtempSync(join(tmpdir(), 'cowbuilders-test-'))
let server

const call = async (method, path, body) => {
  const response = await fetch(base + path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  return { status: response.status, body: await response.json() }
}
const nextHour = (offset = 1) => Math.ceil(Date.now() / 3_600_000) * 3_600_000 + offset * 3_600_000

before(async () => {
  server = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: String(port), DATA_DIR: dataDir }, stdio: 'ignore' })
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) return } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('server did not start')
})
after(async () => {
  const exited = new Promise((resolve) => server.once('exit', resolve))
  server.kill()
  await exited
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

test('players can be created, renamed and must be unique', async () => {
  const created = await call('POST', '/api/players', { name: 'Moo', roles: ['support', 'top'], champion: 'Alistar' })
  assert.equal(created.status, 201)
  assert.deepEqual(created.body.roles, ['support', 'top'])
  assert.equal((await call('POST', '/api/players', { name: 'moo', roles: ['fill'] })).status, 409)
  assert.equal((await call('POST', '/api/players', { name: 'Bad', roles: ['carry'] })).status, 400)
  const renamed = await call('PATCH', `/api/players/${created.body.id}`, { motto: 'Headbutt + Pulverize' })
  assert.equal(renamed.body.motto, 'Headbutt + Pulverize')
})

test('a slot holds at most five players and bulk joins report full slots', async () => {
  const slot = nextHour(2)
  const ids = []
  for (const name of ['A', 'B', 'C', 'D', 'E', 'F']) ids.push((await call('POST', '/api/players', { name, roles: ['fill'] })).body.id)
  for (const id of ids.slice(0, 5)) assert.equal((await call('PUT', '/api/signups', { playerId: id, slots: [slot] })).status, 200)
  assert.equal((await call('PUT', '/api/signups', { playerId: ids[5], slots: [slot] })).status, 409)
  const partial = await call('PUT', '/api/signups', { playerId: ids[5], slots: [slot, slot + 3_600_000] })
  assert.deepEqual(partial.body, { saved: 1, full: [slot] })
  // Re-joining as an existing member updates instead of counting twice.
  assert.equal((await call('PUT', '/api/signups', { playerId: ids[0], slots: [slot], roles: ['mid'], note: 'mid or feed' })).status, 200)
  const schedule = await call('GET', `/api/schedule?from=${slot}&to=${slot + 7_200_000}`)
  assert.equal(schedule.body.signups.filter((signup) => signup.slot === slot).length, 5)
  assert.equal(schedule.body.signups.find((signup) => signup.playerId === ids[0]).note, 'mid or feed')
  assert.equal((await call('DELETE', '/api/signups', { playerId: ids[0], slots: [slot] })).body.removed, 1)
})

test('sessions can be locked and cancelled; bad slots are rejected', async () => {
  assert.equal((await call('POST', '/api/sessions', { slot: 123, mode: 'flex' })).status, 400)
  const session = await call('POST', '/api/sessions', { slot: nextHour(3), mode: 'clash', title: 'Clash Cup' })
  assert.equal(session.status, 201)
  assert.equal((await call('GET', '/api/activity')).body.some((item) => item.kind === 'session'), true)
  assert.equal((await call('DELETE', `/api/sessions/${session.body.id}`)).status, 200)
})

test('absences are validated, listed by end date and removable', async () => {
  const playerId = (await call('POST', '/api/players', { name: 'Traveller', roles: ['fill'] })).body.id
  assert.equal((await call('POST', '/api/absences', { playerId, start: '2026-02-30', end: '2026-03-02' })).status, 400)
  assert.equal((await call('POST', '/api/absences', { playerId, start: '2026-03-05', end: '2026-03-01' })).status, 400)
  const created = await call('POST', '/api/absences', { playerId, start: '2026-08-01', end: '2026-08-14', kind: 'vacation', note: 'Mallorca' })
  assert.equal(created.status, 201)
  assert.equal(created.body.end, '2026-08-14')
  assert.equal((await call('GET', '/api/absences?since=2026-08-14')).body.length, 1)
  assert.equal((await call('GET', '/api/absences?since=2026-08-15')).body.length, 0)
  assert.equal((await call('DELETE', `/api/absences/${created.body.id}`)).status, 200)
})

test('the frontend fallback answers unknown paths', async () => {
  const response = await fetch(`${base}/schedule`)
  assert.ok([200, 404].includes(response.status))
})
