import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actionsFromChoices, choicesFromActions, currentPayload, describeLightStep } from './sceneChoices.js'

const dev = (id, type = 'light', state = null) => ({
  id,
  type,
  expand: state ? { device_state_via_device: [{ state }] } : {},
})
const lamp = (attributes, on = 'on') => dev('l', 'light', { state: on, attributes })

test('choicesFromActions: standaard overslaan, met de huidige thermostaattemperatuur', () => {
  const devices = [dev('a'), dev('t', 'climate', { attributes: { temperature: 18 } })]
  const c = choicesFromActions([], devices)
  assert.equal(c.a.mode, 'skip')
  assert.equal(c.t.temperature, 18)
  assert.equal(choicesFromActions(undefined, [dev('a')]).a.mode, 'skip')
})

test('choicesFromActions: aan, uit, thermostaat en onbekend apparaat', () => {
  const devices = [dev('a'), dev('b'), dev('t', 'climate')]
  const c = choicesFromActions(
    [
      { device: 'a', action: 'turn_on' },
      { device: 'b', action: 'turn_off' },
      { device: 't', action: 'turn_on' },
      { device: 't', action: 'set_temperature', payload: { temperature: 21.5 } },
      { device: 'weg', action: 'turn_on' },
    ],
    devices,
  )
  assert.equal(c.a.mode, 'on')
  assert.equal(c.b.mode, 'off')
  assert.equal(c.t.mode, 'on')
  assert.equal(c.t.temperature, 21.5)
  assert.equal(c.weg, undefined)
})

test('actionsFromChoices: aan, uit, overslaan en thermostaat', () => {
  const devices = [dev('a'), dev('b'), dev('c'), dev('t', 'climate')]
  const actions = actionsFromChoices(
    { a: { mode: 'on' }, b: { mode: 'off' }, c: { mode: 'skip' }, t: { mode: 'on', temperature: 19 } },
    devices,
  )
  assert.deepEqual(actions, [
    { device: 'a', action: 'turn_on' },
    { device: 'b', action: 'turn_off' },
    { device: 't', action: 'turn_on' },
    { device: 't', action: 'set_temperature', payload: { temperature: 19 } },
  ])
})

test('choicesFromActions: turn_on met payload is "zoals nu" met die payload', () => {
  const payload = { brightness_pct: 40, rgb_color: [255, 128, 0] }
  const c = choicesFromActions([{ device: 'a', action: 'turn_on', payload }], [dev('a')])
  assert.equal(c.a.mode, 'current')
  assert.deepEqual(c.a.payload, payload)
})

test('actionsFromChoices: current geeft turn_on met payload', () => {
  const payload = { brightness_pct: 40, color_temp_kelvin: 2700 }
  assert.deepEqual(actionsFromChoices({ a: { mode: 'current', payload } }, [dev('a')]), [
    { device: 'a', action: 'turn_on', payload },
  ])
})

test('payload overleeft ronde door choices en actions', () => {
  const actions = [{ device: 'a', action: 'turn_on', payload: { brightness_pct: 10 } }]
  const devices = [dev('a')]
  assert.deepEqual(actionsFromChoices(choicesFromActions(actions, devices), devices), actions)
})

test('currentPayload: gedimde witte lamp', () => {
  const d = lamp({ supported_color_modes: ['color_temp'], color_mode: 'color_temp', brightness: 102, color_temp_kelvin: 2700 })
  assert.deepEqual(currentPayload(d), { brightness_pct: 40, color_temp_kelvin: 2700 })
})

test('currentPayload: gekleurde lamp', () => {
  const d = lamp({ supported_color_modes: ['color_temp', 'rgb'], color_mode: 'rgb', brightness: 102, rgb_color: [255, 140, 0], color_temp_kelvin: 3000 })
  assert.deepEqual(currentPayload(d), { brightness_pct: 40, rgb_color: [255, 140, 0] })
})

test('currentPayload: dimbare lamp zonder kleur geeft alleen helderheid', () => {
  const d = lamp({ supported_color_modes: ['brightness'], color_mode: 'brightness', brightness: 255 })
  assert.deepEqual(currentPayload(d), { brightness_pct: 100 })
})

test('currentPayload: null bij uit, onoff, unavailable en zonder state', () => {
  assert.equal(currentPayload(lamp({ supported_color_modes: ['color_temp'], brightness: 100 }, 'off')), null)
  assert.equal(currentPayload(lamp({ supported_color_modes: ['onoff'], color_mode: 'onoff' })), null)
  assert.equal(currentPayload(lamp({}, 'unavailable')), null)
  assert.equal(currentPayload(lamp(undefined)), null)
  assert.equal(currentPayload(dev('x')), null)
})

test('describeLightStep', () => {
  assert.equal(describeLightStep({ brightness_pct: 40, color_temp_kelvin: 2700 }), '40%, warm wit')
  assert.equal(describeLightStep({ brightness_pct: 40, color_temp_kelvin: 5000 }), '40%, koel wit')
  assert.equal(describeLightStep({ brightness_pct: 40, rgb_color: [1, 2, 3] }), '40%, kleur')
  assert.equal(describeLightStep({ brightness_pct: 40 }), '40%')
  assert.equal(describeLightStep({ rgb_color: [1, 2, 3] }), 'kleur')
  assert.equal(describeLightStep({}), '')
})
