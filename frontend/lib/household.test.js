import { test } from 'node:test'
import assert from 'node:assert/strict'
import { expiresText, householdError, isAdmin, isExpired, isHouseDataRefusal, lostHouses, pickHouse, roleLabel } from './household.js'
import { INTL, assertMessage } from './messages.testkit.js'

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

test('householdError: de code van de server, in elke taal, nooit zijn message', () => {
  const err = (status, extra = {}) => ({ status, response: { status, message: 'diagnose', data: {}, ...extra } })
  const quiet = console.error
  console.error = () => {}
  try {
    assert.equal(householdError(t, 'Rol wijzigen', err(409, { code: 'last_admin' })), 'Er moet minstens één beheerder blijven')
    assert.equal(householdError(INTL.en.t, 'Changing the role', err(409, { code: 'last_admin' })), 'There must be at least one admin')
    assert.equal(householdError(t, 'Accepteren', err(410, { code: 'invitation_expired' })), 'Deze uitnodiging is verlopen')
    assert.equal(householdError(t, 'Accepteren', err(403, { code: 'email_not_verified' })), 'Bevestig eerst je e-mailadres')
    assert.equal(householdError(t, 'Uitnodigen', err(400, { code: 'already_member' })), 'Al lid van dit huis')
    assert.equal(
      householdError(t, 'Account verwijderen', err(409, { code: 'last_admin_of_house', params: { house: 'Villa' } })),
      'Je bent de laatste beheerder van Villa. Maak eerst iemand anders beheerder.'
    )
    // Een veldfout van PocketBase zelf: geen code, wel data.email.
    assert.equal(
      householdError(t, 'Uitnodigen', err(400, { data: { email: { code: 'validation_is_email' } } })),
      'Vul een geldig e-mailadres in.'
    )
    assert.match(householdError(t, 'Uitnodigen', err(400)), /^Uitnodigen is niet gelukt/)
    assert.match(householdError(t, 'Verlaten', err(0)), /niet bereikbaar/)
    // Een onbekende code valt terug op de status, niet op message.
    assert.match(householdError(INTL.en.t, 'Inviting', err(400, { code: 'no_such_code' })), /^Inviting didn’t work/)
  } finally {
    console.error = quiet
  }
})

test('elke code van de hooks heeft een tekst in elke taal', () => {
  const codes = ['claim_unavailable', 'email_not_verified', 'invalid_code', 'house_not_found', 'box_linked_elsewhere',
    'box_already_linked', 'already_member', 'invitation_not_found', 'member_not_found', 'invitation_expired',
    'invalid_role', 'last_admin', 'last_admin_of_house']
  codes.forEach((code) => assertMessage(`errors.codes.${code}`))
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

test('gast: einde van de dag, bereik en tekst in beide talen', async () => {
  const { guestEnds, guestRange, guestText, dateValue } = await import('./household.js')
  const { INTL } = await import('./messages.testkit.js')
  const ends = new Date(guestEnds('2026-10-20').replace(' ', 'T'))
  assert.equal(dateValue(ends), '2026-10-20')
  assert.equal(ends.getHours(), 23)
  const now = new Date(2026, 9, 14)
  assert.deepEqual(guestRange(now), { min: '2026-10-14', max: '2027-10-14' })
  assert.equal(guestText(INTL.nl, '2026-10-20', now), 'Gast tot en met 20 oktober')
  assert.equal(guestText(INTL.en, '2027-01-02', now), 'Guest until 2 January 2027')
})
