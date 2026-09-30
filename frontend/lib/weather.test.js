import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayLabel, formatDegrees, isWeatherStale, upcomingDays, upcomingHours, WEATHER_STALE_MS } from './weather.js'

const now = new Date(2026, 8, 30, 14, 20).getTime()

test('upcomingHours starts at the running hour and drops the past', () => {
  const hours = [12, 13, 14, 15, 16].map((h) => ({ time: new Date(2026, 8, 30, h).toISOString(), temperature: h }))
  assert.deepEqual(
    upcomingHours({ hours }, now, 2).map((h) => h.temperature),
    [14, 15],
  )
})

test('upcomingDays starts today', () => {
  const days = [29, 30, 1].map((d, i) => ({ date: new Date(2026, i === 2 ? 9 : 8, d, 12).toISOString(), high: d }))
  assert.deepEqual(
    upcomingDays({ days }, now).map((d) => d.high),
    [30, 1],
  )
})

test('dayLabel says Vandaag, Morgen, then the weekday', () => {
  assert.equal(dayLabel(new Date(2026, 8, 30, 12), now), 'Vandaag')
  assert.equal(dayLabel(new Date(2026, 9, 1, 12), now), 'Morgen')
  assert.equal(dayLabel(new Date(2026, 9, 3, 12), now), 'Zaterdag')
})

test('weather is stale after two hours, or without a time', () => {
  assert.equal(isWeatherStale(new Date(now - WEATHER_STALE_MS + 1000).toISOString(), now), false)
  assert.equal(isWeatherStale(new Date(now - WEATHER_STALE_MS - 1000).toISOString(), now), true)
  assert.equal(isWeatherStale('', now), true)
})

test('formatDegrees rounds to whole degrees', () => {
  assert.equal(formatDegrees(25.6), '26°')
  assert.equal(formatDegrees(-0.4), '0°')
})
