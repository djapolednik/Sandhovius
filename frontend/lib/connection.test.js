import { test } from 'node:test'
import assert from 'node:assert/strict'
import { houseConnection } from './connection.js'

const now = Date.UTC(2026, 9, 7, 12)
const iso = (ms) => new Date(ms).toISOString().replace('T', ' ')
const claimed = iso(now - 30 * 24 * 60 * 60 * 1000)

test('houseConnection: gekoppelde box met verse hartslag is bereikbaar', () => {
  const c = houseConnection({ select: 'online', last_seen: iso(now - 10_000), claimed_at: claimed }, now)
  assert.deepEqual(c, { reachable: true, linked: true, since: null })
})

test('houseConnection: gekoppelde box die zweeg reageert niet, met sinds wanneer', () => {
  const last = now - 5 * 60 * 1000
  const c = houseConnection({ select: 'online', last_seen: iso(last), claimed_at: claimed }, now)
  assert.equal(c.reachable, false)
  assert.equal(c.linked, true)
  assert.equal(c.since, Date.parse(iso(last).replace(' ', 'T')))
})

test('houseConnection: zonder gekoppelde box niet bereikbaar, en geen "sinds"', () => {
  const c = houseConnection({ select: 'online', last_seen: iso(now - 10_000), claimed_at: '' }, now)
  assert.deepEqual(c, { reachable: false, linked: false, since: null })
})
