import { test } from 'node:test'
import assert from 'node:assert/strict'
import { browserLanguage, pickLanguage } from './language.js'

test('browserLanguage: de eerste die we hebben, anders Nederlands', () => {
  assert.equal(browserLanguage(['en-GB', 'nl']), 'en')
  assert.equal(browserLanguage(['de-DE', 'nl-BE']), 'nl')
  assert.equal(browserLanguage(['fr', 'EN-us']), 'en')
  assert.equal(browserLanguage(['de']), 'nl')
  assert.equal(browserLanguage(undefined), 'nl')
})

test('pickLanguage: account, dan deze telefoon, dan de browser', () => {
  assert.equal(pickLanguage({ account: 'en', stored: 'nl', navigatorLanguages: ['nl'] }), 'en')
  assert.equal(pickLanguage({ account: '', stored: 'en', navigatorLanguages: ['nl'] }), 'en')
  assert.equal(pickLanguage({ stored: 'fr', navigatorLanguages: ['en-US'] }), 'en')
  assert.equal(pickLanguage({}), 'nl')
})
