import { test } from 'node:test'
import assert from 'node:assert/strict'
import { READING_ORDER, alarmKind, allReadings, primaryReading, readingText } from './sensors.js'
import { INTL } from './messages.testkit.js'

const { nl, en } = INTL

test('primaryReading: de belangrijkste stand eerst, nooit de batterij', () => {
  assert.deepEqual(READING_ORDER, ['smoke', 'water_leak', 'contact', 'occupancy', 'temperature', 'humidity', 'illuminance'])
  assert.deepEqual(primaryReading(['occupancy', 'temperature', 'battery'], { occupancy: true, temperature: 21.5 }),
    { capability: 'occupancy', value: true })
  assert.deepEqual(primaryReading(['water_leak', 'battery'], { water_leak: false, battery: 80 }),
    { capability: 'water_leak', value: false })
  // nog geen stand voor beweging: dan de temperatuur
  assert.deepEqual(primaryReading(['occupancy', 'temperature'], { temperature: 19 }), { capability: 'temperature', value: 19 })
  assert.equal(primaryReading(['battery'], { battery: 50 }), null)
  assert.equal(primaryReading(undefined, { occupancy: true }), null)
  assert.equal(primaryReading(['contact'], null), null)
})

test('primaryReading: motion en illuminance_lux van oudere apparaten', () => {
  assert.deepEqual(primaryReading(['occupancy'], { motion: true }), { capability: 'occupancy', value: true })
  assert.deepEqual(primaryReading(['illuminance'], { illuminance_lux: 40 }), { capability: 'illuminance', value: 40 })
})

test('readingText: woorden, in beide talen', () => {
  // Zigbee2MQTT: contact true = dicht
  assert.equal(readingText(nl, { capability: 'contact', value: true }), 'Dicht')
  assert.equal(readingText(en, { capability: 'contact', value: true }), 'Closed')
  assert.equal(readingText(nl, { capability: 'contact', value: false }), 'Open')
  assert.equal(readingText(nl, { capability: 'water_leak', value: true }), 'Lek')
  assert.equal(readingText(en, { capability: 'water_leak', value: true }), 'Leak')
  assert.equal(readingText(nl, { capability: 'water_leak', value: false }), 'Droog')
  assert.equal(readingText(nl, { capability: 'smoke', value: true }), 'Rook')
  assert.equal(readingText(nl, { capability: 'smoke', value: false }), 'Geen rook')
  assert.equal(readingText(nl, { capability: 'occupancy', value: true }), 'Beweging')
  assert.equal(readingText(nl, { capability: 'occupancy', value: false }), 'Geen beweging')
  assert.equal(readingText(nl, { capability: 'temperature', value: 21.5 }), '21,5°')
  assert.equal(readingText(en, { capability: 'temperature', value: 21.5 }), '21.5°')
  assert.equal(readingText(nl, { capability: 'humidity', value: 54.6 }), '55%')
  assert.equal(readingText(nl, { capability: 'illuminance', value: 40 }), '40 lux')
})

test('alarmKind: rook en lekkage', () => {
  assert.equal(alarmKind({ capabilities: ['smoke', 'battery'] }, { smoke: true }), 'smoke')
  assert.equal(alarmKind({ capabilities: ['water_leak'] }, { water_leak: true }), 'leak')
  assert.equal(alarmKind({ capabilities: ['water_leak'] }, { water_leak: false }), null)
  // een stand zonder de mogelijkheid telt niet (een lamp met een vreemd veld)
  assert.equal(alarmKind({ capabilities: ['onoff'] }, { smoke: true }), null)
  assert.equal(alarmKind({}, null), null)
})

test('allReadings: alles wat de sensor meet, in de volgorde van de tegel, zonder batterij', () => {
  assert.deepEqual(
    allReadings(['occupancy', 'illuminance', 'temperature', 'battery'], { illuminance: 12, occupancy: false, battery: 70 }),
    [
      { capability: 'occupancy', value: false },
      { capability: 'illuminance', value: 12 },
    ]
  )
  // een sensor van vóór de mogelijkheden: alles wat in de stand staat
  assert.deepEqual(allReadings(undefined, { temperature: 20, motion: true }), [
    { capability: 'occupancy', value: true },
    { capability: 'temperature', value: 20 },
  ])
  assert.deepEqual(allReadings(['contact'], null), [])
})
