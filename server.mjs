import { createServer } from 'node:http'
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, normalize, extname, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { DatabaseSync } from 'node:sqlite'

const port = Number(process.env.PORT ?? 3000)
const dataDir = process.env.DATA_DIR ?? './data'
const staticDir = resolve(process.env.STATIC_DIR ?? './dist')
mkdirSync(dataDir, { recursive: true })
const db = new DatabaseSync(join(dataDir, 'cowbuilders.sqlite'))

const ROLES = ['top', 'jungle', 'mid', 'bot', 'support', 'fill']
const MODES = ['flex', 'aram', 'normal', 'clash', 'arena', 'duo']
const MAX_PER_SLOT = 5
const HOUR = 3_600_000
const SLOT_GRANULARITY = 900_000 // 15 min, so half-hour time zones still line up

db.exec(`PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    roles TEXT NOT NULL DEFAULT '["fill"]', modes TEXT NOT NULL DEFAULT '[]',
    champion TEXT NOT NULL DEFAULT 'Alistar', rank TEXT NOT NULL DEFAULT '', motto TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS signups (
    slot INTEGER NOT NULL, player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    roles TEXT NOT NULL, modes TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (slot, player_id)
  );
  CREATE INDEX IF NOT EXISTS signups_player ON signups(player_id, slot);
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY, slot INTEGER NOT NULL, mode TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES players(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS sessions_slot ON sessions(slot);
`)
// Schema version for future additive migrations (check user_version, then ALTER TABLE).
if (db.prepare('PRAGMA user_version').get().user_version === 0) db.exec('PRAGMA user_version = 1')

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
const fail = (message, status = 400) => { throw new HttpError(status, message) }

const send = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(payload))
}
const readBody = (req) => new Promise((resolveBody, reject) => {
  let body = ''
  req.on('data', (chunk) => {
    body += chunk
    if (body.length > 200_000) { reject(new HttpError(413, 'Request too large.')); req.destroy() }
  })
  req.on('end', () => { try { resolveBody(body ? JSON.parse(body) : {}) } catch { reject(new HttpError(400, 'Invalid JSON.')) } })
  req.on('error', reject)
})

const text = (value, field, max, { required = false } = {}) => {
  if (value === undefined || value === null) { if (required) fail(`${field} is required.`); return '' }
  if (typeof value !== 'string') fail(`${field} must be text.`)
  const trimmed = value.trim()
  if (required && !trimmed) fail(`${field} is required.`)
  if (trimmed.length > max) fail(`${field} may be at most ${max} characters.`)
  return trimmed
}
const pickList = (value, allowed, field, { required = false } = {}) => {
  if (value === undefined) { if (required) fail(`${field} is required.`); return undefined }
  if (!Array.isArray(value) || value.some((item) => !allowed.includes(item))) fail(`${field} must be a list of: ${allowed.join(', ')}.`)
  const unique = [...new Set(value)]
  if (required && unique.length === 0) fail(`Pick at least one ${field.replace(/s$/, '')}.`)
  return unique
}
const slotValue = (value) => {
  const slot = Number(value)
  const now = Date.now()
  if (!Number.isSafeInteger(slot) || slot % SLOT_GRANULARITY !== 0) fail('Invalid time slot.')
  if (slot < now - 400 * 24 * HOUR || slot > now + 400 * 24 * HOUR) fail('Time slot is too far away.')
  return slot
}
const rangeParams = (url) => {
  const from = Number(url.searchParams.get('from') ?? Date.now() - 7 * 24 * HOUR)
  const to = Number(url.searchParams.get('to') ?? Date.now() + 28 * 24 * HOUR)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from || to - from > 120 * 24 * HOUR) fail('Invalid range (max 120 days).')
  return { from, to }
}

const playerRow = (row) => row && { ...row, roles: JSON.parse(row.roles), modes: JSON.parse(row.modes) }
const listPlayers = () => db.prepare(`SELECT p.id, p.name, p.roles, p.modes, p.champion, p.rank, p.motto, p.created_at AS createdAt,
    (SELECT COUNT(*) FROM signups s WHERE s.player_id = p.id) AS totalSignups
  FROM players p ORDER BY p.name COLLATE NOCASE`).all().map(playerRow)
const getPlayer = (id) => playerRow(db.prepare('SELECT id, name, roles, modes, champion, rank, motto, created_at AS createdAt FROM players WHERE id = ?').get(id))
const requirePlayer = (id) => getPlayer(Number(id)) ?? fail('Player not found.', 404)
const listSignups = (from, to) => db.prepare(`SELECT slot, player_id AS playerId, roles, modes, note, created_at AS createdAt
  FROM signups WHERE slot >= ? AND slot < ? ORDER BY slot, created_at`).all(from, to).map(playerRow)
const listSessions = (from, to) => db.prepare(`SELECT id, slot, mode, title, created_by AS createdBy, created_at AS createdAt
  FROM sessions WHERE slot >= ? AND slot < ? ORDER BY slot`).all(from, to)

const playerFields = (payload, partial) => {
  const fields = {}
  if (!partial || payload.name !== undefined) {
    fields.name = text(payload.name, 'Name', 32, { required: true })
  }
  const roles = pickList(payload.roles, ROLES, 'roles', { required: !partial })
  if (roles) fields.roles = JSON.stringify(roles)
  const modes = pickList(payload.modes, MODES, 'modes')
  if (modes) fields.modes = JSON.stringify(modes)
  else if (!partial) fields.modes = JSON.stringify(MODES)
  if (payload.champion !== undefined) {
    const champion = text(payload.champion, 'Champion', 40)
    if (champion && !/^[A-Za-z0-9]+$/.test(champion)) fail('Champion must be a Data Dragon id like "MonkeyKing".')
    fields.champion = champion || 'Alistar'
  }
  if (payload.rank !== undefined) fields.rank = text(payload.rank, 'Rank', 40)
  if (payload.motto !== undefined) fields.motto = text(payload.motto, 'Motto', 140)
  return fields
}
const uniqueName = (fn) => {
  try { return fn() } catch (error) {
    if (String(error?.message).includes('UNIQUE')) fail('A cowbuilder with that name already exists.', 409)
    throw error
  }
}

const signupCount = db.prepare('SELECT COUNT(*) AS n FROM signups WHERE slot = ? AND player_id != ?')
const upsertSignup = db.prepare(`INSERT INTO signups(slot, player_id, roles, modes, note) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(slot, player_id) DO UPDATE SET roles = excluded.roles, modes = excluded.modes, note = excluded.note`)
const transaction = (fn) => {
  db.exec('BEGIN IMMEDIATE')
  try { const result = fn(); db.exec('COMMIT'); return result } catch (error) { db.exec('ROLLBACK'); throw error }
}

const routes = [
  ['GET', /^\/api\/health$/, () => [200, { ok: true }]],
  ['GET', /^\/api\/players$/, () => [200, listPlayers()]],
  ['POST', /^\/api\/players$/, async (req) => {
    const fields = playerFields(await readBody(req), false)
    const result = uniqueName(() => db.prepare('INSERT INTO players(name, roles, modes, champion, rank, motto) VALUES (?, ?, ?, ?, ?, ?)')
      .run(fields.name, fields.roles, fields.modes, fields.champion ?? 'Alistar', fields.rank ?? '', fields.motto ?? ''))
    return [201, getPlayer(Number(result.lastInsertRowid))]
  }],
  ['PATCH', /^\/api\/players\/(\d+)$/, async (req, [id]) => {
    requirePlayer(id)
    const fields = playerFields(await readBody(req), true)
    const keys = Object.keys(fields)
    if (keys.length) uniqueName(() => db.prepare(`UPDATE players SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((key) => fields[key]), Number(id)))
    return [200, getPlayer(Number(id))]
  }],
  ['DELETE', /^\/api\/players\/(\d+)$/, (_req, [id]) => {
    requirePlayer(id)
    db.prepare('DELETE FROM players WHERE id = ?').run(Number(id))
    return [200, { deleted: true }]
  }],
  ['GET', /^\/api\/schedule$/, (_req, _params, url) => {
    const { from, to } = rangeParams(url)
    return [200, { signups: listSignups(from, to), sessions: listSessions(from, to) }]
  }],
  // Join one or many slots (calendar painting) with the same roles/modes/note.
  ['PUT', /^\/api\/signups$/, async (req) => {
    const payload = await readBody(req)
    const player = requirePlayer(payload.playerId)
    if (!Array.isArray(payload.slots) || payload.slots.length < 1 || payload.slots.length > 200) fail('Provide 1 to 200 slots.')
    const slots = [...new Set(payload.slots.map(slotValue))]
    const roles = JSON.stringify(pickList(payload.roles ?? player.roles, ROLES, 'roles', { required: true }))
    const modes = JSON.stringify(pickList(payload.modes ?? player.modes, MODES, 'modes', { required: true }))
    const note = text(payload.note, 'Note', 140)
    const full = []
    transaction(() => slots.forEach((slot) => {
      if (signupCount.get(slot, player.id).n >= MAX_PER_SLOT) full.push(slot)
      else upsertSignup.run(slot, player.id, roles, modes, note)
    }))
    if (full.length === slots.length) fail(`That slot already has ${MAX_PER_SLOT} cowbuilders.`, 409)
    return [200, { saved: slots.length - full.length, full }]
  }],
  ['DELETE', /^\/api\/signups$/, async (req) => {
    const payload = await readBody(req)
    const player = requirePlayer(payload.playerId)
    if (!Array.isArray(payload.slots) || payload.slots.length < 1 || payload.slots.length > 200) fail('Provide 1 to 200 slots.')
    const remove = db.prepare('DELETE FROM signups WHERE slot = ? AND player_id = ?')
    const removed = transaction(() => payload.slots.map(slotValue).reduce((sum, slot) => sum + Number(remove.run(slot, player.id).changes), 0))
    return [200, { removed }]
  }],
  ['POST', /^\/api\/sessions$/, async (req) => {
    const payload = await readBody(req)
    const slot = slotValue(payload.slot)
    const mode = pickList([payload.mode], MODES, 'mode', { required: true })[0]
    const title = text(payload.title, 'Title', 80)
    const createdBy = payload.createdBy === undefined || payload.createdBy === null ? null : requirePlayer(payload.createdBy).id
    if (db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE slot = ?').get(slot).n >= 3) fail('That slot already has 3 locked sessions.')
    const result = db.prepare('INSERT INTO sessions(slot, mode, title, created_by) VALUES (?, ?, ?, ?)').run(slot, mode, title, createdBy)
    return [201, db.prepare('SELECT id, slot, mode, title, created_by AS createdBy, created_at AS createdAt FROM sessions WHERE id = ?').get(Number(result.lastInsertRowid))]
  }],
  ['DELETE', /^\/api\/sessions\/(\d+)$/, (_req, [id]) => {
    if (db.prepare('DELETE FROM sessions WHERE id = ?').run(Number(id)).changes === 0) fail('Session not found.', 404)
    return [200, { deleted: true }]
  }],
  ['GET', /^\/api\/activity$/, () => [200, db.prepare(`SELECT * FROM (
      SELECT 'signup' AS kind, s.slot, s.player_id AS playerId, NULL AS mode, s.created_at AS at FROM signups s
      UNION ALL SELECT 'session' AS kind, slot, created_by AS playerId, mode, created_at AS at FROM sessions
    ) ORDER BY at DESC LIMIT 25`).all()]],
]

const handleApi = async (req, res, url) => {
  for (const [method, pattern, handler] of routes) {
    const match = url.pathname.match(pattern)
    if (match && req.method === method) {
      const [status, payload] = await handler(req, match.slice(1), url)
      return send(res, status, payload)
    }
  }
  send(res, 404, { error: 'Not found.' })
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
}
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.json', '.txt'])
const fileCache = new Map()
const loadStatic = (path) => {
  if (fileCache.has(path)) return fileCache.get(path)
  const body = readFileSync(path)
  const ext = extname(path)
  const entry = { body, gzip: COMPRESSIBLE.has(ext) && body.length > 1024 ? gzipSync(body) : null, type: MIME[ext] ?? 'application/octet-stream' }
  fileCache.set(path, entry)
  return entry
}
const serveStatic = (req, res, url) => {
  let path = normalize(join(staticDir, decodeURIComponent(url.pathname)))
  if (!path.startsWith(staticDir) || !existsSync(path) || !statSync(path).isFile()) path = join(staticDir, 'index.html')
  if (!existsSync(path)) { res.writeHead(404); return res.end('Frontend not built. Run npm run build.') }
  const file = loadStatic(path)
  const headers = {
    'Content-Type': file.type,
    'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  }
  const useGzip = file.gzip && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')
  if (useGzip) { headers['Content-Encoding'] = 'gzip'; headers.Vary = 'Accept-Encoding' }
  res.writeHead(200, headers)
  res.end(req.method === 'HEAD' ? undefined : useGzip ? file.gzip : file.body)
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url)
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed.' })
    serveStatic(req, res, url)
  } catch (error) {
    if (error instanceof HttpError) return send(res, error.status, { error: error.message })
    console.error(error)
    send(res, 500, { error: 'Something went wrong. Even Alistar could not carry this one.' })
  }
})
server.listen(port, '0.0.0.0', () => console.log(`Cowbuilders HQ listening on ${port}`))
const shutdown = () => server.close(() => { db.close(); process.exit(0) })
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
