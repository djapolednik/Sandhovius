import { test } from 'node:test'
import assert from 'node:assert/strict'
import { greeting, houseSummary, indoorTemperature, lightSpill } from './home.js'

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

test('lightSpill: geen lamp, geen licht; meer lampen iets meer, nooit fel', () => {
  assert.equal(lightSpill(0), 0)
  assert.ok(lightSpill(1) > 0 && lightSpill(1) < lightSpill(2))
  assert.ok(lightSpill(2) < lightSpill(4))
  assert.equal(lightSpill(4), 1)
  assert.equal(lightSpill(20), 1)
})
