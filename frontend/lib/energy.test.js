import { test } from 'node:test'
import assert from 'node:assert/strict'
import { energyText, meteringOf, powerText } from './energy.js'
import { INTL } from './messages.testkit.js'

const { nl, en } = INTL
const plug = (metering) => ({ expand: { device_state_via_device: [{ state: {}, metering }] } })
const now = new Date(2026, 9, 14, 15)

test('meteringOf: vandaag telt, gisteren niet', () => {
  assert.deepEqual(meteringOf(plug({ power: 120, energy_today: 0.83, day: '2026-10-14' }), now), { power: 120, energyToday: 0.83 })
  assert.deepEqual(meteringOf(plug({ power: 5, energy_today: 2.1, day: '2026-10-13' }), now), { power: 5, energyToday: null })
  assert.equal(meteringOf(plug(null), now), null)
  assert.equal(meteringOf({}, now), null)
})

test('powerText en energyText in beide talen', () => {
  assert.equal(powerText(nl, 1203.4), '1.203 W')
  assert.equal(powerText(en, 1203.4), '1,203 W')
  assert.equal(energyText(nl, 0.8), '0,80 kWh')
  assert.equal(energyText(en, 0.8), '0.80 kWh')
})
