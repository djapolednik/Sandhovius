import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PAIRING_KINDS, doneLine, instructionKey, secondsLeft, visibleCandidates } from './pairing.js'
import { INTL, assertMessage } from './messages.testkit.js'

const { nl, en } = INTL

test('soorten en hun uitleg in elke taal', () => {
  assert.deepEqual(PAIRING_KINDS, ['light', 'switch', 'sensor', 'climate'])
  for (const kind of [...PAIRING_KINDS, 'hue']) assertMessage(instructionKey(kind))
  assert.equal(nl.t(instructionKey('light')), 'Zet de lamp 5 keer aan en uit, 1 seconde per keer.')
})

test('visibleCandidates: wat de bewoner kan kiezen, op volgorde van binnenkomst', () => {
  const c = (id, status, created) => ({ id, status, created })
  const list = [
    c('b', 'found', '2026-10-14 09:00:02.000Z'),
    c('x', 'failed', '2026-10-14 09:00:00.000Z'),
    c('a', 'interviewing', '2026-10-14 09:00:01.000Z'),
    c('d', 'added', '2026-10-14 09:00:00.500Z'),
    c('u', 'unsupported', '2026-10-14 09:00:03.000Z'),
    c('s', 'adding', '2026-10-14 09:00:04.000Z'),
  ]
  assert.deepEqual(visibleCandidates(list).map((x) => x.id), ['a', 'b', 'u', 's'])
  assert.deepEqual(visibleCandidates(undefined), [])
})

test('secondsLeft: tot de sessie dicht gaat, nooit negatief', () => {
  const now = Date.parse('2026-10-14T09:00:00.000Z')
  assert.equal(secondsLeft('2026-10-14 09:04:00.000Z', now), 240)
  assert.equal(secondsLeft('2026-10-14 09:00:00.400Z', now), 1)
  assert.equal(secondsLeft('2026-10-14 08:59:00.000Z', now), 0)
  assert.equal(secondsLeft('', now), 0)
})

test('doneLine: per soort, en gemengd', () => {
  const lamps = [{ type: 'light' }, { type: 'light' }, { type: 'light' }]
  assert.equal(doneLine(nl, lamps), 'Je 3 lampen zijn klaar')
  assert.equal(doneLine(en, lamps), 'Your 3 lights are ready')
  assert.equal(doneLine(nl, [{ type: 'sensor' }]), 'Je sensor is klaar')
  assert.equal(doneLine(nl, [{ type: 'switch' }, { type: 'light' }]), 'Je 2 apparaten zijn klaar')
})
