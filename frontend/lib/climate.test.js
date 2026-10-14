import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PRESET_DEFAULTS, compareText, presetAt, presetTemps } from './climate.js'
import { INTL } from './messages.testkit.js'

const { nl, en } = INTL

test('presetTemps: standaard als het huis niets zette', () => {
  assert.deepEqual(presetTemps(null), PRESET_DEFAULTS)
  assert.deepEqual(presetTemps({ climate_eco: 16.5, climate_comfort: 0 }), { comfort: 20, eco: 16.5, sleep: 16 })
})

test('presetAt: welke stand bij het doel hoort', () => {
  const temps = { comfort: 20, eco: 17, sleep: 17 }
  assert.equal(presetAt(20, temps), 'comfort')
  assert.equal(presetAt(17, temps), 'eco')
  assert.equal(presetAt(18.5, temps), null)
  assert.equal(presetAt(undefined, temps), null)
})

test('compareText: vergeleken met Comfort, in beide talen', () => {
  const temps = { comfort: 20.5, eco: 18.5, sleep: 20.5 }
  assert.equal(compareText(nl, 'eco', temps), '2,0° lager dan Comfort')
  assert.equal(compareText(en, 'eco', temps), '2.0° lower than Comfort')
  assert.equal(compareText(nl, 'sleep', temps), 'Even warm als Comfort')
  assert.equal(compareText(nl, 'sleep', { comfort: 18, sleep: 19 }), '1,0° hoger dan Comfort')
  assert.equal(compareText(nl, 'comfort', temps), '')
})
