import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capabilities, glowFor, iconColorFor, kelvinToRgb, lightStateText, payloadFor, percentFromBrightness, throttle } from './light.js'

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

// --- Task 5: payloadFor en throttle ---

test('payloadFor: alleen de gezette sleutels, afgerond', () => {
  assert.deepEqual(payloadFor({ brightnessPct: 59.6 }), { brightness_pct: 60 })
  assert.deepEqual(payloadFor({ kelvin: 2700.4 }), { color_temp_kelvin: 2700 })
  assert.deepEqual(payloadFor({ rgb: [255.2, 0, 10.7] }), { rgb_color: [255, 0, 11] })
  assert.deepEqual(payloadFor({}), {})
})

test('payloadFor: helderheid en kleur samen kan, binnen de bereiken', () => {
  assert.deepEqual(payloadFor({ brightnessPct: 0.2 }), { brightness_pct: 1 })
  assert.deepEqual(payloadFor({ brightnessPct: 250 }), { brightness_pct: 100 })
  assert.deepEqual(payloadFor({ kelvin: 100 }), { color_temp_kelvin: 1500 })
  assert.deepEqual(payloadFor({ kelvin: 20000 }), { color_temp_kelvin: 9000 })
  assert.deepEqual(payloadFor({ rgb: [300, -5, 0] }), { rgb_color: [255, 0, 0] })
  assert.deepEqual(payloadFor({ brightnessPct: 40, rgb: [1, 2, 3] }), { brightness_pct: 40, rgb_color: [1, 2, 3] })
})

test('payloadFor: nooit kelvin en rgb samen, de laatst gekozen wint', () => {
  assert.deepEqual(payloadFor({ kelvin: 3000, rgb: [1, 2, 3] }), { rgb_color: [1, 2, 3] })
  assert.deepEqual(payloadFor({ kelvin: 3000, rgb: [1, 2, 3], last: 'kelvin' }), { color_temp_kelvin: 3000 })
  assert.deepEqual(payloadFor({ kelvin: 3000, rgb: [1, 2, 3], last: 'rgb' }), { rgb_color: [1, 2, 3] })
})

test('payloadFor: onzin wordt weggelaten', () => {
  assert.deepEqual(payloadFor({ brightnessPct: NaN, kelvin: 'x', rgb: [1, 2] }), {})
})

function fakeClock() {
  let t = 0
  let timers = []
  return {
    env: {
      now: () => t,
      setTimeout: (fn, ms) => {
        const timer = { fn, at: t + ms }
        timers.push(timer)
        return timer
      },
      clearTimeout: (timer) => {
        timers = timers.filter((x) => x !== timer)
      },
    },
    advance(ms) {
      const end = t + ms
      for (;;) {
        const next = timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0]
        if (!next) break
        timers = timers.filter((x) => x !== next)
        t = next.at
        next.fn()
      }
      t = end
    },
  }
}

test('throttle: eerste aanroep gaat meteen door', () => {
  const clock = fakeClock()
  const sent = []
  const th = throttle((v) => sent.push(v), 400, clock.env)
  th.call(1)
  assert.deepEqual(sent, [1])
})

test('throttle: 10 aanroepen in 1 s met 400 ms geven hooguit 4, de laatste waarde als laatste', () => {
  const clock = fakeClock()
  const sent = []
  const th = throttle((v) => sent.push(v), 400, clock.env)
  for (let i = 0; i < 10; i++) {
    th.call(i)
    clock.advance(100)
  }
  clock.advance(1000)
  assert.ok(sent.length <= 4, `te veel: ${sent.join(',')}`)
  assert.equal(sent.at(-1), 9)
  assert.equal(sent[0], 0)
})

test('throttle: zonder wachtende waarde gaat er niets extra door', () => {
  const clock = fakeClock()
  const sent = []
  const th = throttle((v) => sent.push(v), 400, clock.env)
  th.call('a')
  clock.advance(2000)
  th.flush()
  assert.deepEqual(sent, ['a'])
})

test('throttle: flush stuurt de laatste waarde meteen en daarna niet nog een keer', () => {
  const clock = fakeClock()
  const sent = []
  const th = throttle((v) => sent.push(v), 400, clock.env)
  th.call(1)
  clock.advance(50)
  th.call(2)
  th.call(3)
  th.flush()
  assert.deepEqual(sent, [1, 3])
  clock.advance(1000)
  assert.deepEqual(sent, [1, 3])
})

// --- detail-sheet ---
import { createLatestWatchers, controlsVisible, initialMode, swatchSelected, brightnessLabel, createHoldOff, currentRgb, kelvinLabel } from './light.js'

const RED = [255, 59, 48]
const colourAttrs = { supported_color_modes: ['color_temp', 'rgb'], min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6500 }

test('controlsVisible: alleen voor aan of uit', () => {
  assert.equal(controlsVisible({ state: 'on' }), true)
  assert.equal(controlsVisible({ state: 'off' }), true)
  assert.equal(controlsVisible({ state: 'unavailable' }), false)
  assert.equal(controlsVisible({ state: 'unknown' }), false)
  assert.equal(controlsVisible(undefined), false)
})

test('uitstaande kleurlamp: geen staal gekozen, label "Uit", wit eerst', () => {
  const off = { state: 'off', attributes: colourAttrs }
  assert.equal(swatchSelected(off, RED), false)
  assert.equal(brightnessLabel(off, 100), 'Uit')
  assert.equal(initialMode(off.attributes), 'white')
  assert.equal(currentRgb(off.attributes), null)
})

test('aan in rgb-modus: dat staal is gekozen, label met procent', () => {
  const on = { state: 'on', attributes: { ...colourAttrs, color_mode: 'rgb', rgb_color: RED, brightness: 128 } }
  assert.equal(swatchSelected(on, RED), true)
  assert.equal(swatchSelected(on, [10, 132, 255]), false)
  assert.equal(brightnessLabel(on, 50), '50%')
  assert.equal(initialMode(on.attributes), 'colour')
})

test('aan in wit: geen staal gekozen, ook al staat er een oude rgb_color', () => {
  const on = { state: 'on', attributes: { ...colourAttrs, color_mode: 'color_temp', rgb_color: RED } }
  assert.equal(swatchSelected(on, RED), false)
  assert.equal(initialMode(on.attributes), 'white')
})

test('initialMode: alleen kleur kan, dan kleur', () => {
  assert.equal(initialMode({ supported_color_modes: ['rgb'] }), 'colour')
  assert.equal(initialMode({ supported_color_modes: ['brightness'] }), 'white')
})

test('createHoldOff: actief tot de tijd om is', () => {
  let now = 1000
  const hold = createHoldOff(1000, { now: () => now })
  assert.equal(hold.active(), false)
  hold.touch()
  now = 1999
  assert.equal(hold.active(), true)
  now = 2000
  assert.equal(hold.active(), false)
  hold.touch()
  now = 2500
  assert.equal(hold.active(), true)
})

test('createLatestWatchers: alleen de nieuwste wachter per lamp blijft', () => {
  const w = createLatestWatchers()
  const stopped = []
  const t1 = w.begin('a')
  w.register('a', t1, () => stopped.push(1))
  const t2 = w.begin('a')
  assert.deepEqual(stopped, [1])
  w.register('a', t2, () => stopped.push(2))
  const t3 = w.begin('b')
  w.register('b', t3, () => stopped.push(3))
  assert.deepEqual(stopped, [1])
})

test('createLatestWatchers: een oud commando dat te laat terugkomt wordt direct gestopt', () => {
  const w = createLatestWatchers()
  const stopped = []
  const old = w.begin('a')
  const fresh = w.begin('a')
  w.register('a', fresh, () => stopped.push('fresh'))
  w.register('a', old, () => stopped.push('old'))
  assert.deepEqual(stopped, ['old'])
})

test('createHoldOff: remaining zegt hoe lang nog', () => {
  let now = 1000
  const hold = createHoldOff(1000, { now: () => now })
  assert.equal(hold.remaining(), 0)
  hold.touch()
  now = 1400
  assert.equal(hold.remaining(), 600)
  now = 2500
  assert.equal(hold.remaining(), 0)
})

test('kelvinLabel: geen verzonnen waarde bij een lamp die uit staat', () => {
  assert.equal(kelvinLabel({ state: 'on', attributes: { color_temp_kelvin: 2700 } }, 2700), '2700 K')
  assert.equal(kelvinLabel({ state: 'off', attributes: {} }, 4250), 'Uit')
  // Aan in kleur: geen kelvin van de lamp, dus ook geen getal.
  assert.equal(kelvinLabel({ state: 'on', attributes: { color_mode: 'rgb' } }, 4250), '')
})
