import { test } from 'node:test'
import assert from 'node:assert/strict'
import { needsRefresh } from './session.js'

const DAY = 24 * 60 * 60 * 1000
const now = Date.UTC(2026, 9, 7, 12)
// Een token zoals PocketBase het geeft; alleen exp telt (seconden).
const token = (expMs) => {
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ exp: Math.floor(expMs / 1000), type: 'auth' })}.sig`
}
const valid = token(now + 300 * DAY)

test('needsRefresh: nooit verlengd op dit toestel → nu (ook een oud token van 5 dagen)', () => {
  assert.equal(needsRefresh(valid, null, now), true)
  assert.equal(needsRefresh(token(now + 4 * DAY), undefined, now), true)
})

test('needsRefresh: hooguit eens per dag', () => {
  assert.equal(needsRefresh(valid, now - 2 * 60 * 60 * 1000, now), false)
  assert.equal(needsRefresh(valid, now - DAY + 1000, now), false)
  assert.equal(needsRefresh(valid, now - DAY, now), true)
  assert.equal(needsRefresh(valid, now - 40 * DAY, now), true)
})

test('needsRefresh: verlopen of onleesbaar niet (dan opnieuw inloggen)', () => {
  assert.equal(needsRefresh(token(now - 1000), null, now), false)
  assert.equal(needsRefresh('', null, now), false)
  assert.equal(needsRefresh('rommel', null, now), false)
})
