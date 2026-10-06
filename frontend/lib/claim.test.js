import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { normalize, parseClaimLink, pendingKey, claimErrorMessage, isBoxOnline, formatCode } from './claim.js'

const vectors = JSON.parse(
  readFileSync(new URL('../../backend/tests/testdata/claim_codes.json', import.meta.url), 'utf8')
)

test('normalize matches every shared vector', () => {
  assert.ok(vectors.length > 0)
  for (const v of vectors) {
    assert.equal(normalize(v.input), v.normalized, `input ${JSON.stringify(v.input)}`)
    assert.equal(createHash('sha256').update(normalize(v.input)).digest('hex'), v.sha256)
  }
})

test('normalize only removes spaces and dashes', () => {
  assert.equal(normalize(' ab-cd '), 'ABCD')
  assert.equal(normalize('o-i-l'), '011')
  assert.equal(normalize(undefined), '')
})

test('formatCode groups by four', () => {
  assert.equal(formatCode('k7qm2xrp9dtw'), 'K7QM-2XRP-9DTW')
  assert.equal(formatCode('k7qm'), 'K7QM')
})

test('pendingKey', () => {
  assert.equal(pendingKey, 'sandhovius.claim')
})

test('parseClaimLink', () => {
  assert.deepEqual(parseClaimLink('http://localhost:3000/koppel?s=SH-TEST-0002&c=K7QM-2XRP-9DTW'), {
    serial: 'SH-TEST-0002',
    code: 'K7QM-2XRP-9DTW',
  })
  assert.deepEqual(parseClaimLink('  https://app.sandhovius.nl/koppel?s=SH-1&c=abcd-efgh-jkmn \n'), {
    serial: 'SH-1',
    code: 'abcd-efgh-jkmn',
  })
  assert.equal(parseClaimLink('http://localhost:3000/koppel?s=SH-1'), null)
  assert.equal(parseClaimLink('http://localhost:3000/koppel?c=ABCD'), null)
  assert.equal(parseClaimLink('http://localhost:3000/andere?s=SH-1&c=ABCD'), null)
  assert.equal(parseClaimLink('hallo wereld'), null)
  assert.equal(parseClaimLink(''), null)
  assert.equal(parseClaimLink(undefined), null)
})

test('claimErrorMessage', () => {
  assert.equal(claimErrorMessage(403, 'x'), 'Bevestig eerst je e-mailadres')
  assert.equal(claimErrorMessage(400, 'x'), 'Deze code klopt niet')
  assert.equal(claimErrorMessage(409, 'x'), 'Deze box is al gekoppeld')
  assert.equal(claimErrorMessage(404, 'x'), 'Dit huis is niet gevonden')
  assert.equal(claimErrorMessage(429, 'Too Many Requests'), 'Te veel pogingen, probeer het over een minuut opnieuw')
  assert.match(claimErrorMessage(0, ''), /verbinding/)
  assert.match(claimErrorMessage(500, 'boom'), /Er ging iets mis/)
})

test('isBoxOnline: heartbeat must be newer than the claim', () => {
  const claimedAt = '2026-10-06 12:00:00.000Z'
  assert.equal(isBoxOnline({ last_seen: '' }, claimedAt), false)
  assert.equal(isBoxOnline(null, claimedAt), false)
  // Oude hartslag van de vorige box (vervangen huis).
  assert.equal(isBoxOnline({ last_seen: '2026-10-06 11:59:59.000Z' }, claimedAt), false)
  assert.equal(isBoxOnline({ last_seen: '2026-10-06 12:00:00.000Z' }, claimedAt), false)
  // last_seen is een autodate: het opslaan van het huis bij het koppelen zet hem zelf op bijna dezelfde tijd.
  assert.equal(isBoxOnline({ last_seen: '2026-10-06 12:00:00.400Z' }, claimedAt), false)
  assert.equal(isBoxOnline({ last_seen: '2026-10-06 12:00:01.900Z' }, claimedAt), false)
  assert.equal(isBoxOnline({ last_seen: '2026-10-06 12:00:02.100Z' }, claimedAt), true)
  assert.equal(isBoxOnline({ last_seen: '2026-10-06 12:00:30.000Z' }, claimedAt), true)
  // Zonder claimmoment telt elke hartslag.
  assert.equal(isBoxOnline({ last_seen: '2026-10-06 12:00:30.000Z' }, ''), true)
})
