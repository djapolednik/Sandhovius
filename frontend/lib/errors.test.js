import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeError } from './errors.js'
import { INTL } from './messages.testkit.js'

function quietly(fn) {
  const quiet = console.error
  console.error = () => {}
  try {
    return fn()
  } finally {
    console.error = quiet
  }
}

test('describeError: 429 zegt wachten, niet "zo opnieuw"', () => {
  const { t } = INTL.nl
  assert.equal(
    quietly(() => describeError(t, t('errors.what.saveOrder'), { status: 429 })),
    'Volgorde opslaan is niet gelukt. Te veel pogingen; wacht even en probeer het dan opnieuw.'
  )
})

test('describeError: elke status in beide talen, ook een onbekende', () => {
  for (const { t } of [INTL.nl, INTL.en]) {
    for (const status of [0, 400, 401, 403, 404, 429, 500, undefined]) {
      const text = quietly(() => describeError(t, 'X', status === undefined ? new Error('boom') : { status }))
      assert.match(text, /^X /)
    }
  }
  assert.equal(
    quietly(() => describeError(INTL.en.t, INTL.en.t('errors.what.switchOn', { name: 'Lamp' }), { status: 0 })),
    'Switching on Lamp didn’t work. Sandhovius can’t be reached right now; check your internet connection and try again.'
  )
})
