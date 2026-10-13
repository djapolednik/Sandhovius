import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayNames, describeDays, describeSchedules } from './schedules.js'
import { INTL } from './messages.testkit.js'

const { nl, en } = INTL

test('describeDays', () => {
  assert.equal(describeDays(nl, ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']), 'Elke dag')
  assert.equal(describeDays(nl, ['fri', 'mon', 'tue', 'wed', 'thu']), 'Werkdagen')
  assert.equal(describeDays(nl, ['sun', 'sat']), 'Weekend')
  assert.equal(describeDays(nl, ['fri', 'mon', 'wed']), 'Maandag, woensdag en vrijdag')
  assert.equal(describeDays(nl, ['tue']), 'Dinsdag')
  assert.equal(describeDays(nl, []), '')
})

test('describeDays in het Engels', () => {
  assert.equal(describeDays(en, ['fri', 'mon', 'tue', 'wed', 'thu']), 'Weekdays')
  assert.equal(describeDays(en, ['fri', 'mon', 'wed']), 'Monday, Wednesday and Friday')
})

test('dayNames: kort en lang, maandag eerst', () => {
  assert.deepEqual(dayNames('nl-NL')[0], { key: 'mon', short: 'ma', long: 'maandag' })
  assert.deepEqual(dayNames('en-GB')[6], { key: 'sun', short: 'Sun', long: 'Sunday' })
})

test('describeSchedules', () => {
  const s = (time, days, enabled = true) => ({ time, days, enabled })
  assert.equal(describeSchedules(nl, []), '')
  assert.equal(describeSchedules(nl, [s('23:00', ['mon'], false)]), '')
  assert.equal(describeSchedules(nl, [s('07:00', ['mon', 'tue', 'wed', 'thu', 'fri'])]), 'Werkdagen om 07:00')
  assert.equal(describeSchedules(nl, [s('22:00', ['sat']), s('07:00', ['mon']), s('07:00', ['sun'])]), 'Om 07:00 en 22:00')
  assert.equal(describeSchedules(en, [s('07:00', ['sat', 'sun'])]), 'Weekend at 07:00')
  assert.equal(describeSchedules(en, [s('22:00', ['sat']), s('07:00', ['mon'])]), 'At 07:00 and 22:00')
})
