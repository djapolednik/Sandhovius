import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeError } from './errors.js'

test('describeError: 429 zegt wachten, niet "zo opnieuw"', () => {
  const quiet = console.error
  console.error = () => {}
  try {
    assert.equal(
      describeError('De resetlink versturen', { status: 429 }),
      'De resetlink versturen is niet gelukt. Te veel pogingen; wacht even en probeer het dan opnieuw.'
    )
  } finally {
    console.error = quiet
  }
})
