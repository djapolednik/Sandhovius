import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultLanguage, validateSignup, errorMessage } from './account.js'

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
  assert.equal(errorMessage({ status: 429 }), 'Te veel pogingen, probeer het over een minuut opnieuw')
  assert.equal(errorMessage({ status: 0 }), 'Geen verbinding met Sandhovius. Controleer je internet en probeer het opnieuw')
  assert.equal(errorMessage(new Error('boom')), 'Er ging iets mis. Probeer het zo opnieuw')
  assert.equal(errorMessage(null), 'Er ging iets mis. Probeer het zo opnieuw')
})
