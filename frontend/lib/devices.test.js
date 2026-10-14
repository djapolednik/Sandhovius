import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayType } from './devices.js'

test('displayType: een stopcontact als lamp is een lamp in de app', () => {
  assert.equal(displayType({ type: 'switch', shown_as: 'light' }), 'light')
  assert.equal(displayType({ type: 'switch', shown_as: '' }), 'switch')
  assert.equal(displayType({ type: 'sensor' }), 'sensor')
  // shown_as hoort alleen bij een stopcontact; anders telt het type
  assert.equal(displayType({ type: 'sensor', shown_as: 'light' }), 'sensor')
})
