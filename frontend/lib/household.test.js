import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expiresText, householdError, isAdmin, pickHouse, roleLabel } from './household.js'

test('roleLabel: beheerder en huisgenoot', () => {
  assert.equal(roleLabel('admin'), 'Beheerder')
  assert.equal(roleLabel('member'), 'Huisgenoot')
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
  assert.equal(expiresText(at(0, 3), now), 'verloopt vandaag')
  assert.equal(expiresText(at(1), now), 'verloopt morgen')
  assert.equal(expiresText(at(5), now), 'verloopt over 5 dagen')
  assert.equal(expiresText(at(0, -1), now), 'verlopen')
  assert.equal(expiresText('', now), 'verlopen')
})

test('pickHouse: gekozen huis, anders het eerste, anders niets', () => {
  const houses = [{ id: 'a' }, { id: 'b' }]
  assert.equal(pickHouse(houses, 'b').id, 'b')
  assert.equal(pickHouse(houses, 'weg').id, 'a')
  assert.equal(pickHouse(houses, '').id, 'a')
  assert.equal(pickHouse([], 'a'), undefined)
})

test('householdError: Nederlandse melding van de server bij 403, 409, 410 en "Al lid"', () => {
  const err = (status, message, data = {}) => ({ status, response: { status, message, data } })
  assert.equal(householdError('Rol wijzigen', err(409, 'Er moet minstens één beheerder blijven')), 'Er moet minstens één beheerder blijven')
  assert.equal(householdError('Accepteren', err(410, 'Deze uitnodiging is verlopen')), 'Deze uitnodiging is verlopen')
  assert.equal(householdError('Accepteren', err(403, 'Bevestig eerst je e-mailadres')), 'Bevestig eerst je e-mailadres')
  assert.equal(householdError('Uitnodigen', err(400, 'Al lid van dit huis.')), 'Al lid van dit huis.')
  assert.equal(
    householdError('Uitnodigen', err(400, 'Failed to create record.', { email: { code: 'validation_is_email' } })),
    'Vul een geldig e-mailadres in.'
  )
  assert.match(householdError('Uitnodigen', err(400, 'Failed to create record.')), /^Uitnodigen is niet gelukt/)
  assert.match(householdError('Verlaten', err(0, '')), /niet bereikbaar/)
})
