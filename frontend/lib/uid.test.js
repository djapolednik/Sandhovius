import { test } from 'node:test'
import assert from 'node:assert/strict'
import { uid } from './uid.js'

test('uid: ook zonder crypto.randomUUID (http op het thuisnetwerk)', () => {
  const ids = new Set(Array.from({ length: 1000 }, () => uid({})))
  assert.equal(ids.size, 1000)
  assert.equal(uid({ randomUUID: () => 'x-1' }), 'x-1')
})
