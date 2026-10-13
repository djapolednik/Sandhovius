import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attentionLine, greeting, homeLede, houseSummary, indoorTemperature, sortAttention } from './home.js'

const at = (h) => new Date(2026, 9, 13, h, 30)

test('greeting: dagdeel en voornaam', () => {
  assert.equal(greeting(at(8), 'David Pieters'), 'Goedemorgen, David')
  assert.equal(greeting(at(14), 'David'), 'Goedemiddag, David')
  assert.equal(greeting(at(20), ''), 'Goedenavond')
  assert.equal(greeting(at(2), null), 'Goedenacht')
  assert.equal(greeting(at(6), '  '), 'Goedemorgen')
})

test('houseSummary: in gewone woorden, zonder middelpunten', () => {
  assert.equal(houseSummary({ lightsOn: 0, plugsOn: 0 }), 'Alles is uit')
  assert.equal(houseSummary({ lightsOn: 1, plugsOn: 0 }), '1 lamp aan')
  assert.equal(houseSummary({ lightsOn: 3, plugsOn: 1 }), '3 lampen en 1 stopcontact aan')
  assert.equal(houseSummary({ lightsOn: 0, plugsOn: 2, indoor: 20.5 }), '2 stopcontacten aan, binnen 20,5°')
  assert.equal(houseSummary({ lightsOn: 0, plugsOn: 0, indoor: 19 }), 'Alles is uit, binnen 19,0°')
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
  assert.equal(homeLede({ summary: '2 lampen aan', weather }), '2 lampen aan. Buiten helder, 9°')
  assert.equal(homeLede({ summary: null, weather }), 'Buiten helder, 9°')
  assert.equal(homeLede({ summary: 'Alles is uit', weather, weatherStale: true }), 'Alles is uit')
  assert.equal(homeLede({}), null)
})

const item = (name, kind, reason) => ({ device: { id: name, name }, kind, reason })

test('sortAttention: wat het niet doet eerst, de volgorde binnen een soort blijft', () => {
  const items = [
    item('Sensor', 'battery', 'batterij bijna leeg (12%)'),
    item('Lamp A', 'offline', 'offline'),
    item('Stekker', 'setup', 'klaarzetten is niet gelukt'),
    item('Lamp B', 'offline', 'offline'),
  ]
  assert.deepEqual(
    sortAttention(items).map((i) => i.device.name),
    ['Stekker', 'Lamp A', 'Lamp B', 'Sensor']
  )
  assert.equal(items[0].device.name, 'Sensor')
})

test('attentionLine: één apparaat bij naam, meer als aantal', () => {
  assert.equal(attentionLine([]), null)
  assert.equal(attentionLine([item('Testlamp', 'offline', 'offline')]), 'Testlamp: offline')
  assert.equal(
    attentionLine([item('A', 'offline', 'offline'), item('B', 'battery', 'batterij bijna leeg (9%)')]),
    '2 apparaten vragen aandacht'
  )
})
