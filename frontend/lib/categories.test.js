import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CATEGORIES, categoriesOf, categorySummary } from './categories.js'
import { INTL } from './messages.testkit.js'

const { nl, en } = INTL

// device + stand, zoals page.js ze heeft (stand uit device_state)
const d = (id, type, capabilities = [], state = null, extra = {}) => ({
  id, type, capabilities, ...extra, expand: { device_state_via_device: state ? [{ state }] : [] },
})

test('categoriesOf: per apparaat de categorieën', () => {
  assert.deepEqual(CATEGORIES, ['light', 'climate', 'security', 'water'])
  assert.deepEqual(categoriesOf(d('a', 'light')), ['light'])
  assert.deepEqual(categoriesOf(d('b', 'switch', ['onoff'], null, { shown_as: 'light' })), ['light'])
  assert.deepEqual(categoriesOf(d('c', 'switch', ['onoff'])), [])
  assert.deepEqual(categoriesOf(d('e', 'climate', ['heating', 'valve', 'temperature'])), ['climate'])
  assert.deepEqual(categoriesOf(d('f', 'sensor', ['contact', 'temperature', 'battery'])), ['climate', 'security'])
  assert.deepEqual(categoriesOf(d('g', 'sensor', ['smoke'])), ['security'])
  assert.deepEqual(categoriesOf(d('h', 'sensor', ['water_leak', 'battery'])), ['water'])
  assert.deepEqual(categoriesOf(d('i', 'sensor', ['occupancy'])), [])
})

const house = [
  d('l1', 'light', [], { state: 'on' }),
  d('l2', 'light', [], { state: 'off' }),
  d('p1', 'switch', ['onoff'], { state: 'on' }, { shown_as: 'light' }),
  d('k1', 'climate', ['heating', 'valve', 'temperature'], { state: 'heat', attributes: { current_temperature: 20.5 } }),
  d('s1', 'sensor', ['contact'], { contact: false }),
  d('s2', 'sensor', ['contact'], { contact: true }),
  d('w1', 'sensor', ['water_leak'], { water_leak: false }),
]

test('categorySummary: alleen categorieën die het huis heeft, met de stand in woorden', () => {
  const sum = categorySummary(nl, house)
  assert.deepEqual(sum.map((c) => [c.key, c.label, c.state, c.alert, c.devices.length]), [
    ['light', 'Licht', '2 aan', false, 3],
    ['climate', 'Klimaat', '20,5°', false, 1],
    ['security', 'Veiligheid', '1 open', false, 2],
    ['water', 'Water', 'Droog', false, 1],
  ])
  assert.deepEqual(categorySummary(nl, [d('x', 'sensor', ['occupancy'])]), [])
})

test('categorySummary: rustig, alarm en onbekend', () => {
  const calm = [d('l', 'light', [], { state: 'off' }), d('s', 'sensor', ['contact'], { contact: true })]
  assert.deepEqual(categorySummary(nl, calm).map((c) => c.state), ['Uit', 'Alles dicht'])
  const leak = categorySummary(en, [d('w', 'sensor', ['water_leak'], { water_leak: true })])[0]
  assert.equal(leak.state, 'Leak')
  assert.equal(leak.alert, true)
  const smoke = categorySummary(nl, [d('r', 'sensor', ['smoke'], { smoke: true }), d('s', 'sensor', ['contact'], { contact: false })])[0]
  assert.deepEqual([smoke.state, smoke.alert], ['Rook', true])
  // box niet bereikbaar: geen stand, wel de knoppen
  assert.deepEqual(categorySummary(nl, house, { known: false }).map((c) => c.state), ['', '', '', ''])
  assert.equal(categorySummary(en, house)[0].state, '2 on')
})
