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

test('needsRefresh: een vers token (5 dagen geldig) niet', () => {
  assert.equal(needsRefresh(token(now + 5 * DAY), now), false)
  assert.equal(needsRefresh(token(now + 4.5 * DAY), now), false)
})

test('needsRefresh: na een dag wel, tot het verlopen is', () => {
  assert.equal(needsRefresh(token(now + 3.9 * DAY), now), true)
  assert.equal(needsRefresh(token(now + 60 * 1000), now), true)
})

test('needsRefresh: verlopen of onleesbaar niet (dan opnieuw inloggen)', () => {
  assert.equal(needsRefresh(token(now - 1000), now), false)
  assert.equal(needsRefresh('', now), false)
  assert.equal(needsRefresh('rommel', now), false)
})
