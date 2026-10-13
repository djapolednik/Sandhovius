import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OFF_AFTER_STEPS, byRoom, describeMotionLight, motionFromState, motionSensors, switchableDevices } from './motionLights.js'
import { INTL } from './messages.testkit.js'

const { nl, en } = INTL

const device = (id, type, state, extra = {}) => ({
  id,
  name: id,
  type,
  entity_id: `x.${id}`,
  expand: state === undefined ? {} : { device_state_via_device: [{ state }] },
  ...extra,
})

test('motionFromState: zoals de agent, Zigbee2MQTT en Home Assistant', () => {
  assert.equal(motionFromState({ occupancy: true }), true)
  assert.equal(motionFromState({ motion: false, battery: 80 }), false)
  assert.equal(motionFromState({ state: 'on' }), true)
  assert.equal(motionFromState({ state: 'off' }), false)
  assert.equal(motionFromState({ state: '21.5' }), null)
  assert.equal(motionFromState({ battery: 80 }), null)
  assert.equal(motionFromState(null), null)
})

test('motionSensors: alleen sensoren die ooit beweging meldden, op naam', () => {
  const devices = [
    device('Gang', 'sensor', { occupancy: false }),
    device('Temperatuur', 'sensor', { temperature: 20 }),
    device('Badkamer', 'sensor', { state: 'on' }),
    device('Nieuw', 'sensor'),
    device('Lamp', 'light', { state: 'on' }),
  ]
  assert.deepEqual(motionSensors(devices).map((d) => d.id), ['Badkamer', 'Gang'])
})

test('switchableDevices: lampen en stopcontacten die klaargezet zijn', () => {
  const devices = [
    device('Lamp', 'light', { state: 'off' }),
    device('Stekker', 'switch', { state: 'off' }),
    device('Thermostaat', 'climate', {}),
    device('Gang', 'sensor', { occupancy: false }),
    device('Wordt klaargezet', 'light', undefined, { entity_id: '' }),
  ]
  assert.deepEqual(switchableDevices(devices).map((d) => d.id), ['Lamp', 'Stekker'])
})

test('OFF_AFTER_STEPS: binnen wat PocketBase toelaat', () => {
  assert.ok(OFF_AFTER_STEPS.every((m) => Number.isInteger(m) && m >= 1 && m <= 60))
  assert.ok(OFF_AFTER_STEPS.includes(3))
})

test('describeMotionLight: de lampen en wanneer ze uitgaan, in beide talen', () => {
  const names = { a: 'Plafondlamp', b: 'Nachtlamp', c: 'Spiegellamp', d: 'Bedlamp' }
  const rule = (devices, offAfter = 3) => ({ devices, off_after: offAfter })
  assert.equal(describeMotionLight(nl, rule(['a']), names), 'Plafondlamp, uit na 3 minuten')
  assert.equal(describeMotionLight(nl, rule(['a', 'b'], 1)), 'Nog geen lampen, uit na 1 minuut')
  assert.equal(describeMotionLight(nl, rule(['a', 'b'], 1), names), 'Plafondlamp en Nachtlamp, uit na 1 minuut')
  assert.equal(describeMotionLight(nl, rule(['a', 'b', 'c', 'd']), names), 'Plafondlamp, Nachtlamp en nog 2, uit na 3 minuten')
  assert.equal(describeMotionLight(nl, rule([]), names), 'Nog geen lampen, uit na 3 minuten')
  assert.equal(describeMotionLight(en, rule(['a', 'b'], 10), names), 'Plafondlamp and Nachtlamp, off after 10 minutes')
})

test('byRoom: in de volgorde van de kamers, dan op naam, zonder kamer als laatste', () => {
  const rooms = [{ id: 'k', order: 2 }, { id: 'w', order: 1 }]
  const d = (name, room) => ({ id: name, name, room })
  const devices = [d('Spiegellamp', ''), d('Keukenlamp', 'k'), d('Staande lamp', 'w'), d('Bedlamp', 'weg'), d('Plafondlamp', 'w')]
  assert.deepEqual(
    byRoom(devices, rooms).map((x) => x.name),
    ['Plafondlamp', 'Staande lamp', 'Keukenlamp', 'Bedlamp', 'Spiegellamp']
  )
})
