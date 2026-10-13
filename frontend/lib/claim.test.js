import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import {
  normalize,
  normalizeSerial,
  parseClaimLink,
  pendingKey,
  claimError,
  isBoxOnline,
  formatCode,
  codeProblem,
  isValidCode,
} from './claim.js'
import { INTL, assertMessage } from './messages.testkit.js'

const vectors = JSON.parse(
  readFileSync(new URL('../../backend/tests/testdata/claim_codes.json', import.meta.url), 'utf8')
)

test('normalize matches every shared vector', () => {
  assert.ok(vectors.length > 0)
  for (const v of vectors) {
    assert.equal(normalize(v.input), v.normalized, `input ${JSON.stringify(v.input)}`)
    // Zelfde HMAC als de hook (testsleutel uit backend/tests/pbtest_test.go).
    assert.equal(createHmac('sha256', 'sandhovius-test-key').update(normalize(v.input)).digest('hex'), v.hmac)
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

test('normalizeSerial trims and uppercases', () => {
  assert.equal(normalizeSerial('  sh-dev-0001 '), 'SH-DEV-0001')
  assert.equal(normalizeSerial('SH-1'), 'SH-1')
  assert.equal(normalizeSerial(undefined), '')
})

test('parseClaimLink reads the fragment', () => {
  assert.deepEqual(parseClaimLink('http://localhost:3000/koppel#s=SH-TEST-0002&c=K7QM-2XRP-9DTW'), {
    serial: 'SH-TEST-0002',
    code: 'K7QM-2XRP-9DTW',
  })
  assert.deepEqual(parseClaimLink('https://app.sandhovius.nl/koppel/#s=sh-1&c=abcd-efgh-jkmn'), {
    serial: 'SH-1',
    code: 'abcd-efgh-jkmn',
  })
  assert.equal(parseClaimLink('http://localhost:3000/koppel#s=SH-1'), null)
  assert.equal(parseClaimLink('http://localhost:3000/koppel#c=ABCD'), null)
  assert.equal(parseClaimLink('http://localhost:3000/andere#s=SH-1&c=ABCD'), null)
})

test('parseClaimLink still reads the old query form', () => {
  assert.deepEqual(parseClaimLink('http://localhost:3000/koppel?s=SH-TEST-0002&c=K7QM-2XRP-9DTW'), {
    serial: 'SH-TEST-0002',
    code: 'K7QM-2XRP-9DTW',
  })
  assert.deepEqual(parseClaimLink('  https://app.sandhovius.nl/koppel?s=sh-1&c=abcd-efgh-jkmn \n'), {
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

test('claimError: de code van de hook, anders per status', () => {
  const { t } = INTL.nl
  const err = (status, extra = {}) => ({ status, response: { status, message: '', ...extra } })
  assert.equal(claimError(t, err(409, { code: 'box_linked_elsewhere', params: { house: 'Villa' } })), 'Deze box hoort al bij Villa. Ontkoppel hem daar eerst')
  assert.equal(claimError(INTL.en.t, err(409, { code: 'box_linked_elsewhere', params: { house: 'Villa' } })), 'This box already belongs to Villa. Unlink it there first')
  assert.equal(claimError(t, err(403)), 'Bevestig eerst je e-mailadres')
  assert.equal(claimError(t, err(400)), 'Deze code klopt niet')
  // Overgang: een 409 zonder code toont de melding van de hook.
  assert.equal(claimError(t, err(409, { message: 'Deze box hoort al bij Villa. Ontkoppel hem daar eerst' })), 'Deze box hoort al bij Villa. Ontkoppel hem daar eerst')
  assert.equal(claimError(t, err(409)), 'Deze box is al gekoppeld')
  assert.equal(claimError(t, err(404)), 'Dit huis is niet gevonden')
  assert.equal(claimError(t, err(429)), 'Te veel pogingen, probeer het over een minuut opnieuw')
  assert.equal(claimError(t, err(503)), 'Koppelen lukt nu niet. Probeer het later opnieuw')
  assert.match(claimError(t, { status: 0 }), /verbinding/)
  assert.match(claimError(t, err(500)), /Er ging iets mis/)
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

const checkVectors = JSON.parse(
  readFileSync(new URL('../../backend/tests/testdata/claim_check.json', import.meta.url), 'utf8')
)

test('isValidCode: gedeelde vectoren met het printscript', () => {
  for (const v of checkVectors) assert.equal(isValidCode(v.code), v.valid, `${v.code} (${v.note})`)
})

test('codeProblem: lengte eerst, dan het controleteken, anders niets', () => {
  assert.equal(codeProblem('K7QM-2XRP-9DT'), 'claim.codeLength')
  assert.equal(codeProblem('K7QM-2XRP-9DTKA'), 'claim.codeLength')
  assert.equal(codeProblem('K7QM-24RP-9DTK'), 'claim.codeTypo')
  assert.equal(codeProblem('K7QM-2XRP-9DTU'), 'claim.codeTypo')
  ;['claim.codeLength', 'claim.codeTypo'].forEach(assertMessage)
  assert.equal(codeProblem('k7qm 2xrp 9dtk'), '')
})
