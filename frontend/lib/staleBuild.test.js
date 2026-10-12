import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isStaleBuildError, shouldAutoReload, RELOAD_GUARD_MS } from './staleBuild.js'

test('isStaleBuildError: ontbrekende bestanden van een oude versie', () => {
  const e = (name, message) => Object.assign(new Error(message), { name })
  assert.equal(isStaleBuildError(e('ChunkLoadError', 'Loading chunk 123 failed')), true)
  assert.equal(isStaleBuildError(e('Error', 'Failed to load chunk /_next/static/chunks/abc.js')), true)
  assert.equal(isStaleBuildError(e('TypeError', 'Importing a module script failed.')), true) // Safari
  assert.equal(isStaleBuildError(e('TypeError', 'Failed to fetch dynamically imported module: x.js')), true) // Chrome
  assert.equal(isStaleBuildError(e('TypeError', "Cannot read properties of undefined (reading 'x')")), false)
  assert.equal(isStaleBuildError(null), false)
})

test('shouldAutoReload: één keer, daarna niet meteen weer (geen lus)', () => {
  const store = new Map()
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) }
  assert.equal(shouldAutoReload(storage, 1000), true)
  assert.equal(shouldAutoReload(storage, 1000 + RELOAD_GUARD_MS - 1), false)
  assert.equal(shouldAutoReload(storage, 1000 + RELOAD_GUARD_MS + 1), true)
  // Zonder opslag (privémodus): liever niet automatisch, dan zeker geen lus.
  assert.equal(shouldAutoReload(null, 1000), false)
})
