import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expiresText, householdError, isAdmin, isExpired, isHouseDataRefusal, lostHouses, pickHouse, roleLabel } from './household.js'
import { INTL } from './messages.testkit.js'

const { t } = INTL.nl

test('roleLabel: beheerder en huisgenoot', () => {
  assert.equal(roleLabel(t, 'admin'), 'Beheerder')
  assert.equal(roleLabel(t, 'member'), 'Huisgenoot')
  assert.equal(roleLabel(INTL.en.t, 'admin'), 'Admin')
})

test('isAdmin: alleen wie in admins van dit huis staat', () => {
  const house = { members: ['a', 'b'], admins: ['a'] }
  assert.equal(isAdmin(house, 'a'), true)
  assert.equal(isAdmin(house, 'b'), false)
  assert.equal(isAdmin(undefined, 'a'), false)
  assert.equal(isAdmin({ members: ['a'] }, 'a'), false)
})

test('expiresText: vandaag, morgen, over N dagen, verlopen', () => {
  const now = new Date('2026-10-07T10:00:00Z')
  const at = (days, hours = 0) => new Date(now.getTime() + (days * 24 + hours) * 3600 * 1000).toISOString().replace('T', ' ')
  assert.equal(expiresText(t, at(0, 3), now), 'verloopt vandaag')
  assert.equal(expiresText(t, at(1), now), 'verloopt morgen')
  assert.equal(expiresText(t, at(5), now), 'verloopt over 5 dagen')
  assert.equal(expiresText(t, at(0, -1), now), 'verlopen')
  assert.equal(expiresText(t, '', now), 'verlopen')
  assert.equal(expiresText(INTL.en.t, at(5), now), 'expires in 5 days')
  assert.equal(isExpired(at(0, -1), now), true)
  assert.equal(isExpired(at(1), now), false)
})

test('pickHouse: gekozen huis, anders het eerste, anders niets', () => {
  const houses = [{ id: 'a' }, { id: 'b' }]
  assert.equal(pickHouse(houses, 'b').id, 'b')
  assert.equal(pickHouse(houses, 'weg').id, 'a')
  assert.equal(pickHouse(houses, '').id, 'a')
  assert.equal(pickHouse([], 'a'), undefined)
})

test('householdError: de code van de server eerst, in elke taal', () => {
  const err = (status, message, extra = {}) => ({ status, response: { status, message, data: {}, ...extra } })
  const quiet = console.error
  console.error = () => {}
  try {
    // Zolang een hook nog geen code stuurt: de oude Nederlandse melding.
    assert.equal(householdError(t, 'Rol wijzigen', err(409, 'Er moet minstens één beheerder blijven')), 'Er moet minstens één beheerder blijven')
    assert.equal(householdError(t, 'Accepteren', err(410, 'Deze uitnodiging is verlopen')), 'Deze uitnodiging is verlopen')
    assert.equal(householdError(t, 'Accepteren', err(403, 'Bevestig eerst je e-mailadres')), 'Bevestig eerst je e-mailadres')
    assert.equal(householdError(t, 'Uitnodigen', err(400, 'Al lid van dit huis.')), 'Al lid van dit huis.')
    assert.equal(
      householdError(t, 'Uitnodigen', err(400, 'Failed to create record.', { data: { email: { code: 'validation_is_email' } } })),
      'Vul een geldig e-mailadres in.'
    )
    assert.match(householdError(t, 'Uitnodigen', err(400, 'Failed to create record.')), /^Uitnodigen is niet gelukt/)
    assert.match(householdError(t, 'Verlaten', err(0, '')), /niet bereikbaar/)
    // Een onbekende code valt terug op de status.
    assert.match(householdError(INTL.en.t, 'Inviting', err(400, 'x', { code: 'no_such_code' })), /^Inviting didn’t work/)
  } finally {
    console.error = quiet
  }
})

test('isHouseDataRefusal: een 4xx op huisdata, niet op inloggen of bij te veel verzoeken', () => {
  const base = 'http://localhost:8090'
  assert.equal(isHouseDataRefusal(`${base}/api/collections/commands/records`, 400), true)
  assert.equal(isHouseDataRefusal(`${base}/api/collections/devices/records/abc`, 404), true)
  assert.equal(isHouseDataRefusal(`${base}/api/collections/houses/records/abc?expand=x`, 403), true)
  assert.equal(isHouseDataRefusal(`${base}/api/sandhovius/houses/abc/members`, 404), true)
  assert.equal(isHouseDataRefusal(`${base}/api/collections/scenes/records`, 401), false)
  assert.equal(isHouseDataRefusal(`${base}/api/collections/commands/records`, 429), false)
  assert.equal(isHouseDataRefusal(`${base}/api/collections/commands/records`, 200), false)
  assert.equal(isHouseDataRefusal(`${base}/api/collections/commands/records`, 500), false)
  assert.equal(isHouseDataRefusal(`${base}/api/collections/users/records/abc`, 404), false)
  assert.equal(isHouseDataRefusal(`${base}/api/collections/invitations/records/abc`, 404), false)
  assert.equal(isHouseDataRefusal(`${base}/api/sandhovius/claim`, 400), false)
})

test('lostHouses: huizen die weg zijn, behalve die je zelf verliet', () => {
  const a = { id: 'a', name: 'Thuis' }
  const b = { id: 'b', name: 'Strandhuis' }
  assert.deepEqual(lostHouses([a, b], [b]), [a])
  assert.deepEqual(lostHouses([a, b], [b], ['a']), [])
  assert.deepEqual(lostHouses([a], [a, b]), [])
  assert.deepEqual(lostHouses([], []), [])
})
