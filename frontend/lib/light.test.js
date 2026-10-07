import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capabilities, glowFor, iconColorFor, kelvinToRgb, lightStateText, percentFromBrightness } from './light.js'

const caps = (modes) => capabilities({ supported_color_modes: modes })
const none = { dim: false, white: false, colour: false }

test('capabilities: alleen onoff kan niets', () => {
  assert.deepEqual(caps(['onoff']), { ...none, minKelvin: null, maxKelvin: null })
})

test('capabilities: brightness kan dimmen', () => {
  const c = caps(['brightness'])
  assert.equal(c.dim, true)
  assert.equal(c.white, false)
  assert.equal(c.colour, false)
})

test('capabilities: color_temp kan dimmen en wit', () => {
  const c = capabilities({ supported_color_modes: ['color_temp'], min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500 })
  assert.equal(c.dim, true)
  assert.equal(c.white, true)
  assert.equal(c.colour, false)
  assert.equal(c.minKelvin, 2200)
  assert.equal(c.maxKelvin, 6500)
})

test('capabilities: color_temp met hs kan ook kleur', () => {
  const c = caps(['color_temp', 'hs'])
  assert.equal(c.dim && c.white && c.colour, true)
})

test('capabilities: onbekend of zonder attributen is alles false', () => {
  for (const a of [undefined, null, {}, { supported_color_modes: null }]) {
    assert.deepEqual(capabilities(a), { ...none, minKelvin: null, maxKelvin: null })
  }
  assert.equal(capabilities({ supported_color_modes: ['unknown'] }).dim, false)
})

test('percentFromBrightness rondt af, minimaal 1', () => {
  assert.equal(percentFromBrightness(255), 100)
  assert.equal(percentFromBrightness(1), 1)
  assert.equal(percentFromBrightness(128), 50)
  assert.equal(percentFromBrightness(0), 1)
  assert.equal(percentFromBrightness(null), null)
  assert.equal(percentFromBrightness(undefined), null)
})

test('kelvinToRgb: 2200 is warm, 6500 is wit', () => {
  const [r, g, b] = kelvinToRgb(2200)
  assert.ok(r > g && g > b)
  const [wr, wg, wb] = kelvinToRgb(6500)
  assert.ok(wr >= 250 && wg >= 250 && wb >= 250)
  assert.deepEqual(kelvinToRgb(1000), kelvinToRgb(2200))
})

test('glowFor: sterkte volgt helderheid', () => {
  const low = glowFor({ brightness: 3, color_mode: 'brightness' }).strength
  assert.ok(low > 0 && low < 0.3)
  assert.equal(glowFor({ brightness: 255 }).strength, 1)
  assert.equal(glowFor({}).strength, 1)
  assert.equal(glowFor({ brightness: 255 }).color, null)
})

test('glowFor: kleurtemperatuur en rgb geven een kleur', () => {
  const warm = glowFor({ brightness: 255, color_mode: 'color_temp', color_temp_kelvin: 2200 })
  assert.equal(warm.color, 'rgb(255, 176, 32)')
  const red = glowFor({ brightness: 255, color_mode: 'rgb', rgb_color: [255, 0, 0] })
  assert.match(red.color, /^rgb\(255, \d+, \d+\)$/)
  assert.notEqual(red.color, 'rgb(255, 0, 0)')
})

test('glowFor: kapotte attributen geven de standaard gloed', () => {
  assert.deepEqual(glowFor(undefined), { color: null, rgb: null, strength: 1 })
  assert.deepEqual(glowFor({ color_mode: 'rgb', rgb_color: 'x' }).color, null)
})

test('iconColorFor: donkere kleur op donker thema valt terug', () => {
  assert.equal(iconColorFor([10, 10, 60], 'dark'), null)
  assert.equal(iconColorFor([255, 170, 60], 'dark'), 'rgb(255, 170, 60)')
  assert.equal(iconColorFor([255, 240, 150], 'light'), null)
  assert.equal(iconColorFor([10, 10, 60], 'light'), 'rgb(10, 10, 60)')
  assert.equal(iconColorFor(null, 'dark'), null)
})

test('lightStateText', () => {
  assert.equal(lightStateText({ state: 'on', attributes: { supported_color_modes: ['brightness'], brightness: 153 } }), 'Aan · 60%')
  assert.equal(lightStateText({ state: 'on', attributes: { supported_color_modes: ['onoff'] } }), 'Aan')
  assert.equal(lightStateText({ state: 'on', attributes: { supported_color_modes: ['brightness'] } }), 'Aan')
  assert.equal(lightStateText({ state: 'off', attributes: { supported_color_modes: ['brightness'] } }), 'Uit')
  assert.equal(lightStateText({ state: 'on' }), 'Aan')
})
