import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateSignup, requestErrorKey, signupErrorKey, confirmFailure, passwordChecks } from './account.js'
import { assertMessage } from './messages.testkit.js'

test('validateSignup: een sleutel per probleem, die in beide talen bestaat', () => {
  const ok = { email: 'a@b.nl', password: '12345678', passwordConfirm: '12345678' }
  assert.equal(validateSignup(ok), null)
  const keys = [
    validateSignup({ ...ok, email: '  ' }),
    validateSignup({ ...ok, password: '1234567', passwordConfirm: '1234567' }),
    validateSignup({ ...ok, passwordConfirm: 'x2345678' }),
  ]
  assert.deepEqual(keys, ['account.enterEmail', 'account.passwordTooShort', 'account.passwordsDiffer'])
  keys.forEach(assertMessage)
})

test('requestErrorKey en signupErrorKey', () => {
  const exists = { status: 400, response: { data: { email: { code: 'validation_not_unique' } } } }
  assert.equal(signupErrorKey(exists), 'account.emailTaken')
  // Een resetlink voor een ongeldig adres is geen "bestaat al".
  assert.equal(requestErrorKey(exists), 'account.somethingWrong')
  // Aanmelden: 10 per uur, mail opnieuw: 5 per 10 min (per IP): geen "minuut" beloven.
  assert.equal(requestErrorKey({ status: 429 }), 'account.tooManyAttempts')
  assert.equal(signupErrorKey({ status: 0 }), 'account.offline')
  assert.equal(requestErrorKey(new Error('boom')), 'account.somethingWrong')
  assert.equal(signupErrorKey(null), 'account.somethingWrong')
  ;['account.emailTaken', 'account.tooManyAttempts', 'account.offline', 'account.somethingWrong'].forEach(assertMessage)
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
