import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeDays, describeSchedules } from './schedules.js'

test('describeDays', () => {
  assert.equal(describeDays(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']), 'Elke dag')
  assert.equal(describeDays(['fri', 'mon', 'tue', 'wed', 'thu']), 'Werkdagen')
  assert.equal(describeDays(['sun', 'sat']), 'Weekend')
  assert.equal(describeDays(['fri', 'mon', 'wed']), 'Maandag, woensdag en vrijdag')
  assert.equal(describeDays(['tue']), 'Dinsdag')
  assert.equal(describeDays([]), '')
})

test('describeSchedules', () => {
  const s = (time, days, enabled = true) => ({ time, days, enabled })
  assert.equal(describeSchedules([]), '')
  assert.equal(describeSchedules([s('23:00', ['mon'], false)]), '')
  assert.equal(describeSchedules([s('07:00', ['mon', 'tue', 'wed', 'thu', 'fri'])]), 'Werkdagen om 07:00')
  assert.equal(describeSchedules([s('22:00', ['sat']), s('07:00', ['mon']), s('07:00', ['sun'])]), 'Om 07:00 en 22:00')
})
