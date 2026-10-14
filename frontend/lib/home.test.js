import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attentionLine, greeting, homeLede, houseSummary, indoorTemperature, sortAttention } from './home.js'
import { INTL } from './messages.testkit.js'

const { nl, en } = INTL
const at = (h) => new Date(2026, 9, 13, h, 30)

test('greeting: dagdeel en voornaam', () => {
  assert.equal(greeting(nl, at(8), 'David Pieters'), 'Goedemorgen, David')
  assert.equal(greeting(nl, at(14), 'David'), 'Goedemiddag, David')
  assert.equal(greeting(nl, at(20), ''), 'Goedenavond')
  assert.equal(greeting(nl, at(2), null), 'Goedenacht')
  assert.equal(greeting(nl, at(6), '  '), 'Goedemorgen')
  assert.equal(greeting(en, at(8), 'David Pieters'), 'Good morning, David')
  assert.equal(greeting(en, at(20), ''), 'Good evening')
})

test('houseSummary: in gewone woorden, zonder middelpunten', () => {
  assert.equal(houseSummary(nl, { lightsOn: 0, plugsOn: 0 }), 'Alles is uit')
  assert.equal(houseSummary(nl, { lightsOn: 1, plugsOn: 0 }), '1 lamp aan')
  assert.equal(houseSummary(nl, { lightsOn: 3, plugsOn: 1 }), '3 lampen en 1 stopcontact aan')
  assert.equal(houseSummary(nl, { lightsOn: 0, plugsOn: 2, indoor: 20.5 }), '2 stopcontacten aan, binnen 20,5°')
  assert.equal(houseSummary(nl, { lightsOn: 0, plugsOn: 0, indoor: 19 }), 'Alles is uit, binnen 19,0°')
})

test('houseSummary in het Engels: "and", een punt als decimaalteken', () => {
  assert.equal(houseSummary(en, { lightsOn: 0, plugsOn: 0 }), 'Everything is off')
  assert.equal(houseSummary(en, { lightsOn: 1, plugsOn: 0 }), '1 light on')
  assert.equal(houseSummary(en, { lightsOn: 3, plugsOn: 1 }), '3 lights and 1 plug on')
  assert.equal(houseSummary(en, { lightsOn: 0, plugsOn: 2, indoor: 20.5 }), '2 plugs on, 20.5° inside')
})

test('sortAttention: rook en lekkage boven alles', () => {
  const items = [{ kind: 'battery' }, { kind: 'offline' }, { kind: 'leak' }, { kind: 'smoke' }]
  assert.deepEqual(sortAttention(items).map((i) => i.kind), ['smoke', 'leak', 'offline', 'battery'])
  assert.equal(attentionLine(nl, [{ kind: 'leak', device: { name: 'Keuken' } }]), 'Keuken: lekkage')
  assert.equal(attentionLine(en, [{ kind: 'smoke', device: { name: 'Hall' } }]), 'Hall: smoke')
})

test('indoorTemperature: thermostaat eerst, anders een sensor', () => {
  const thermostat = { type: 'climate', state: { attributes: { current_temperature: 20.4 } } }
  const sensor = { type: 'sensor', state: { temperature: 18.2 } }
  assert.equal(indoorTemperature([sensor, thermostat]), 20.4)
  assert.equal(indoorTemperature([sensor]), 18.2)
  assert.equal(indoorTemperature([{ type: 'climate', state: { attributes: {} } }]), null)
  assert.equal(indoorTemperature([]), null)
})

test('homeLede: huis en buiten in één regel, zonder verouderd weer', () => {
  const weather = { condition: 'clear-night', temperature: 9.4 }
  assert.equal(homeLede(nl, { summary: '2 lampen aan', weather }), '2 lampen aan. Buiten helder, 9°')
  assert.equal(homeLede(nl, { summary: null, weather }), 'Buiten helder, 9°')
  assert.equal(homeLede(nl, { summary: 'Alles is uit', weather, weatherStale: true }), 'Alles is uit')
  assert.equal(homeLede(nl, { summary: null, weather: { condition: 'partlycloudy' } }), 'Buiten half bewolkt')
  assert.equal(homeLede(nl, {}), null)
  assert.equal(homeLede(en, { summary: '2 lights on', weather }), '2 lights on. Outside clear, 9°')
})

const item = (name, kind, battery) => ({ device: { id: name, name }, kind, battery })

test('sortAttention: wat het niet doet eerst, de volgorde binnen een soort blijft', () => {
  const items = [item('Sensor', 'battery', 12), item('Lamp A', 'offline'), item('Keuken', 'leak'), item('Lamp B', 'offline')]
  assert.deepEqual(
    sortAttention(items).map((i) => i.device.name),
    ['Keuken', 'Lamp A', 'Lamp B', 'Sensor']
  )
  assert.equal(items[0].device.name, 'Sensor')
})

test('attentionLine: één apparaat bij naam, meer als aantal', () => {
  assert.equal(attentionLine(nl, []), null)
  assert.equal(attentionLine(nl, [item('Testlamp', 'offline')]), 'Testlamp: offline')
  assert.equal(attentionLine(nl, [item('Sensor', 'battery', 9)]), 'Sensor: batterij bijna leeg (9%)')
  assert.equal(attentionLine(nl, [item('A', 'offline'), item('B', 'battery', 9)]), '2 apparaten vragen aandacht')
  assert.equal(attentionLine(en, [item('Plug', 'offline')]), 'Plug: offline')
  assert.equal(attentionLine(en, [item('A', 'offline'), item('B', 'offline')]), '2 devices need attention')
})
