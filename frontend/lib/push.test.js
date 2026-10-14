import { test } from 'node:test'
import assert from 'node:assert/strict'
import { keyBytes, pushState, pushSupport, subscriptionRecord } from './push.js'

test('keyBytes: base64url zonder opvulling naar bytes', () => {
  assert.deepEqual([...keyBytes('AQID_-8')], [1, 2, 3, 255, 239])
  assert.equal(keyBytes('BL' + 'A'.repeat(85)).length, 65)
})

test('pushSupport: iPhone alleen vanaf het beginscherm', () => {
  assert.equal(pushSupport({ hasPush: true, standalone: false, ios: false }), 'ok')
  assert.equal(pushSupport({ hasPush: false, standalone: false, ios: true }), 'install')
  assert.equal(pushSupport({ hasPush: true, standalone: true, ios: true }), 'ok')
  assert.equal(pushSupport({ hasPush: false, standalone: true, ios: false }), 'unsupported')
})

test('pushState: van niet kunnen tot aan, en een vervangen box', () => {
  const base = { support: 'ok', permission: 'default', houseKey: 'K', mine: null }
  assert.equal(pushState({ ...base, support: 'install' }), 'install')
  assert.equal(pushState({ ...base, houseKey: '' }), 'noKey')
  assert.equal(pushState({ ...base, permission: 'denied' }), 'denied')
  assert.equal(pushState(base), 'off')
  assert.equal(pushState({ ...base, permission: 'granted', mine: { key: 'K' } }), 'on')
  assert.equal(pushState({ ...base, permission: 'granted', mine: { key: 'OUD' } }), 'stale')
})

test('subscriptionRecord: velden voor PocketBase', () => {
  const json = { endpoint: 'https://push.example/x', keys: { p256dh: 'P', auth: 'A' } }
  assert.deepEqual(subscriptionRecord(json, { house: 'h', user: 'u', key: 'K', language: 'nl' }), {
    house: 'h', user: 'u', endpoint: 'https://push.example/x', p256dh: 'P', auth: 'A', key: 'K', language: 'nl',
  })
})
