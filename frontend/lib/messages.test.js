import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IntlMessageFormat } from 'intl-messageformat'
import { LANGUAGES, LOCALES } from './language.js'
import { MESSAGES, keysOf, lookup } from './messages.testkit.js'

test('elke taal heeft dezelfde sleutels', () => {
  const [first, ...rest] = LANGUAGES
  const expected = keysOf(MESSAGES[first]).sort()
  for (const language of rest) {
    assert.deepEqual(keysOf(MESSAGES[language]).sort(), expected, `${language}.json wijkt af van ${first}.json`)
  }
})

test('elk bericht is geldige ICU', () => {
  for (const language of LANGUAGES) {
    for (const key of keysOf(MESSAGES[language])) {
      assert.doesNotThrow(
        () => new IntlMessageFormat(lookup(MESSAGES[language], key), LOCALES[language]),
        `${language}: ${key}`
      )
    }
  }
})
