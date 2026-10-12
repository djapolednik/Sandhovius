import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultLanguage, validateSignup, errorMessage, confirmFailure, passwordChecks } from './account.js'

test('defaultLanguage picks the first nl or en', () => {
  assert.equal(defaultLanguage(['en-GB', 'nl']), 'en')
  assert.equal(defaultLanguage(['nl-BE']), 'nl')
  assert.equal(defaultLanguage(['de']), 'nl')
  assert.equal(defaultLanguage(['de', 'en-US']), 'en')
  assert.equal(defaultLanguage([]), 'nl')
  assert.equal(defaultLanguage(undefined), 'nl')
})

test('validateSignup', () => {
  const ok = { email: 'a@b.nl', password: '12345678', passwordConfirm: '12345678' }
  assert.equal(validateSignup(ok), null)
  assert.match(validateSignup({ ...ok, email: '  ' }), /e-mailadres/)
  assert.match(validateSignup({ ...ok, password: '1234567', passwordConfirm: '1234567' }), /8 tekens/)
  assert.match(validateSignup({ ...ok, passwordConfirm: 'x2345678' }), /niet gelijk/)
})

test('errorMessage', () => {
  const exists = { status: 400, response: { data: { email: { code: 'validation_not_unique' } } } }
  assert.equal(errorMessage(exists), 'Er bestaat al een account met dit e-mailadres')
  // Aanmelden: 10 per uur, mail opnieuw: 5 per 10 min (per IP): geen "minuut" beloven.
  assert.equal(errorMessage({ status: 429 }), 'Te veel pogingen. Wacht even en probeer het dan opnieuw')
  assert.equal(errorMessage({ status: 0 }), 'Geen verbinding met Sandhovius. Controleer je internet en probeer het opnieuw')
  assert.equal(errorMessage(new Error('boom')), 'Er ging iets mis. Probeer het zo opnieuw')
  assert.equal(errorMessage(null), 'Er ging iets mis. Probeer het zo opnieuw')
})

test('confirmFailure: alleen een ongeldige link is "werkt niet meer"', () => {
  assert.equal(confirmFailure({ status: 400 }), 'invalid')
  assert.equal(confirmFailure({ status: 404 }), 'invalid')
  assert.equal(confirmFailure({ status: 0 }), 'offline')
  assert.equal(confirmFailure({ status: 429 }), 'busy')
  assert.equal(confirmFailure({ status: 500 }), 'offline')
  assert.equal(confirmFailure(new Error('boom')), 'offline')
})

test('passwordChecks: lengte en gelijk, gelijk pas als er iets getypt is', () => {
  assert.deepEqual(passwordChecks('', ''), { long: false, same: false })
  assert.deepEqual(passwordChecks('kort', 'kort'), { long: false, same: true })
  assert.deepEqual(passwordChecks('lang-genoeg', 'lang-genoe'), { long: true, same: false })
  assert.deepEqual(passwordChecks('lang-genoeg', 'lang-genoeg'), { long: true, same: true })
})
