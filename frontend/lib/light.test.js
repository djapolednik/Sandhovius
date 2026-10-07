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
