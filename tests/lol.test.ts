import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readiness, solveLineup } from '../src/lol.ts'
import type { Candidate } from '../src/lol.ts'

const all = ['flex', 'aram', 'normal', 'clash', 'arena', 'duo'] as Candidate['modes']
const player = (playerId: number, roles: Candidate['roles']): Candidate => ({ playerId, roles, modes: all })

test('lineup solver honours preferences and uses fill players for gaps', () => {
  const lineup = solveLineup([player(1, ['mid']), player(2, ['mid', 'top']), player(3, ['fill']), player(4, ['bot']), player(5, ['support'])])
  assert.equal(lineup.covered, 5)
  assert.equal(lineup.assignment.mid, 1)
  assert.equal(lineup.assignment.top, 2)
  assert.equal(lineup.assignment.jungle, 3)
})

test('four players cannot queue flex, five covering every lane can clash', () => {
  const four = [1, 2, 3, 4].map((id) => player(id, ['fill']))
  assert.equal(readiness('flex', four).state, 'close')
  assert.equal(readiness('aram', four).state, 'ready')
  assert.equal(readiness('arena', four).state, 'full')
  const five = [...four, player(5, ['fill'])]
  assert.equal(readiness('clash', five).state, 'full')
  const allMid = [1, 2, 3, 4, 5].map((id) => player(id, ['mid']))
  assert.equal(readiness('clash', allMid).state, 'close')
})

test('only players up for a mode count towards it', () => {
  const group = [player(1, ['top']), { ...player(2, ['jungle']), modes: ['aram'] as Candidate['modes'] }]
  assert.equal(readiness('duo', group).state, 'close')
  assert.equal(readiness('aram', group).state, 'ready')
})
