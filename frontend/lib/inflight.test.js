import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyStateEcho, createInflight, settleDevice } from './inflight.js'

const state = (s, extra = {}) => ({ id: 'st1', device: 'd1', state: { state: s, ...extra } })
const device = (s, extra = {}) => ({ id: 'd1', expand: { device_state_via_device: [state(s)] }, ...extra })

test('createInflight: telt per apparaat, done is eenmalig', () => {
  const inflight = createInflight()
  assert.equal(inflight.count('d1'), 0)
  const a = inflight.begin('d1')
  const b = inflight.begin('d1')
  inflight.begin('d2')
  assert.equal(inflight.count('d1'), 2)
  assert.equal(a(), 1)
  assert.equal(a(), 1, 'tweede keer done telt niet opnieuw af')
  assert.equal(b(), 0)
  assert.equal(inflight.count('d1'), 0)
  assert.equal(inflight.count('d2'), 1)
})

test('applyStateEcho: zonder lopende commando\'s de echte stand tonen', () => {
  const next = applyStateEcho(device('on', { _pending: true }), state('off'), 0)
  assert.equal(next.expand.device_state_via_device[0].state.state, 'off')
  assert.equal(next._pending, false)
  assert.equal(next._echo, undefined)
})

test('applyStateEcho: met lopende commando\'s het voornemen houden, echo bewaren', () => {
  // Je sleept naar 80%; de echo van een eerder commando (40%) komt binnen.
  const d = device('on', { _pending: true })
  const echo = state('on', { attributes: { brightness: 102 } })
  const next = applyStateEcho(d, echo, 1)
  assert.equal(next.expand, d.expand, 'tegel blijft het voornemen tonen')
  assert.equal(next._pending, true)
  assert.equal(next._echo, echo)
})

test('settleDevice: laatste commando klaar → bewaarde echo tonen', () => {
  const echo = state('off')
  const next = settleDevice(device('on', { _pending: true, _echo: echo }), 0)
  assert.equal(next.expand.device_state_via_device[0], echo)
  assert.equal(next._pending, false)
  assert.equal(next._echo, undefined)
})

test('settleDevice: nog geen echo → voornemen houden, niet meer "wacht"', () => {
  const d = device('on', { _pending: true })
  const next = settleDevice(d, 0)
  assert.equal(next.expand, d.expand)
  assert.equal(next._pending, false)
})

test('settleDevice: er loopt nog een commando → niets veranderen', () => {
  const d = device('on', { _pending: true, _echo: state('off') })
  assert.equal(settleDevice(d, 1), d)
})
