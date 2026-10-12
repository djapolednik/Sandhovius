import { test } from 'node:test'
import assert from 'node:assert/strict'
import { movedBeyondSlop } from './longPress.js'

test('movedBeyondSlop: trillen mag, trekken of scrollen niet', () => {
  const start = { x: 100, y: 200 }
  assert.equal(movedBeyondSlop(start, 100, 200), false)
  assert.equal(movedBeyondSlop(start, 106, 206), false) // ~8,5 px: een duim trilt
  assert.equal(movedBeyondSlop(start, 100, 211), true) // omlaag trekken (verversen)
  assert.equal(movedBeyondSlop(start, 89, 200), true) // zijwaarts (scènepillen)
})
