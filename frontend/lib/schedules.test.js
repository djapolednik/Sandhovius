import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SUN_OFFSETS, dayNames, describeDays, describeSchedules, nextRunText, scheduleSortKey, scheduleWhen } from './schedules.js'
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

const sun = (trigger, offset_min = 0, days = ['mon', 'tue', 'wed', 'thu', 'fri'], enabled = true) =>
  ({ trigger, offset_min, time: '', days, enabled })

test('scheduleWhen: een tijd of de zon met verschuiving, in beide talen', () => {
  assert.deepEqual(SUN_OFFSETS, [15, 30, 45, 60, 90, 120])
  assert.equal(scheduleWhen(nl, { time: '23:00' }), 'om 23:00')
  assert.equal(scheduleWhen(nl, { trigger: 'time', time: '07:30' }), 'om 07:30')
  assert.equal(scheduleWhen(nl, sun('sunset')), 'bij zonsondergang')
  assert.equal(scheduleWhen(nl, sun('sunrise', -30)), '30 minuten voor zonsopkomst')
  assert.equal(scheduleWhen(nl, sun('sunset', 60)), '1 uur na zonsondergang')
  assert.equal(scheduleWhen(nl, sun('sunset', 90)), '1 uur en 30 minuten na zonsondergang')
  assert.equal(scheduleWhen(nl, sun('sunrise', -120)), '2 uur voor zonsopkomst')
  assert.equal(scheduleWhen(en, sun('sunset')), 'at sunset')
  assert.equal(scheduleWhen(en, sun('sunrise', -15)), '15 minutes before sunrise')
  assert.equal(scheduleWhen(en, sun('sunset', 60)), '1 hour after sunset')
  assert.equal(scheduleWhen(en, sun('sunset', 90)), '1 hour and 30 minutes after sunset')
})

test('describeSchedules met de zon', () => {
  assert.equal(describeSchedules(nl, [sun('sunset')]), 'Werkdagen bij zonsondergang')
  assert.equal(describeSchedules(en, [sun('sunrise', -30, ['sat', 'sun'])]), 'Weekend 30 minutes before sunrise')
  const s = (time, days) => ({ time, days, enabled: true })
  assert.equal(describeSchedules(nl, [s('07:00', ['mon']), sun('sunset')]), 'Om 07:00 en bij zonsondergang')
  assert.equal(describeSchedules(en, [sun('sunset'), s('22:00', ['mon'])]), 'At 22:00 and at sunset')
})

test('nextRunText: vandaag, morgen of de dag', () => {
  // Woensdag 14 oktober 2026, 12:00 lokale tijd
  const now = new Date(2026, 9, 14, 12, 0)
  const at = (d, h, m) => new Date(2026, 9, d, h, m).toISOString()
  assert.equal(nextRunText(nl, at(14, 18, 47), now), 'vandaag om 18:47')
  assert.equal(nextRunText(nl, at(15, 8, 5), now), 'morgen om 08:05')
  assert.equal(nextRunText(nl, at(16, 18, 43), now), 'vrijdag om 18:43')
  assert.equal(nextRunText(en, at(14, 18, 47), now), 'today at 18:47')
  assert.equal(nextRunText(en, at(16, 18, 43), now), 'Friday at 18:43')
  assert.equal(nextRunText(nl, '', now), '')
  // PocketBase schrijft een spatie i.p.v. de T
  assert.equal(nextRunText(nl, at(14, 18, 47).replace('T', ' '), now), 'vandaag om 18:47')
})

test('scheduleSortKey: een zon-schema sorteert op zijn tijd van vandaag', () => {
  const nextRun = new Date(2026, 9, 14, 18, 47).toISOString()
  assert.equal(scheduleSortKey({ time: '07:00' }), '07:00')
  assert.equal(scheduleSortKey({ ...sun('sunset'), next_run: nextRun }), '18:47')
  assert.equal(scheduleSortKey(sun('sunset')), '99:99')
})
