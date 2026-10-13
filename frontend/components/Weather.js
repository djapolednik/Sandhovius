'use client'

import { useRef } from 'react'
import { useIntl } from '../app/LanguageContext'
import { WeatherIcon } from '../lib/icons'
import { useScrollEdges } from '../lib/useScrollEdges'
import {
  dayLabel,
  describeCondition,
  formatDegrees,
  formatHour,
  isWeatherStale,
  upcomingDays,
  upcomingHours,
} from '../lib/weather'

// Het weer is bijzaak: het vult Home, maar zegt niets over het huis zelf.
// Het gloeit dus niet en zegt altijd hoe oud het is. Verouderd (de box
// haalt het niet meer op, meestal geen internet): het laatst bekende weer
// blijft staan, met een amber regel erbij.
function StaleNote({ updated }) {
  const { t, locale } = useIntl()
  return <p className="weather-stale">{t('weather.stale', { time: formatHour(updated, locale) })}</p>
}

// Breed scherm: een eigen kaart links op Home (op de telefoon staat het weer
// van nu in de regel onder de groet). Nu groot, dan de
// komende uren als strook en de komende dagen met een temperatuurbalk: van
// de laagste tot de hoogste temperatuur, op de schaal van de hele week.
export function WeatherCard({ weather, updated, now }) {
  const intl = useIntl()
  const { t, locale } = intl
  const hoursRef = useRef(null)
  const { key: conditionKey, icon } = describeCondition(weather.condition)
  const hours = upcomingHours(weather, now)
  const days = upcomingDays(weather, now)
  const edges = useScrollEdges(hoursRef, hours.length)
  const stale = isWeatherStale(updated, now)

  const lows = days.map((day) => day.low ?? day.high)
  const min = Math.min(...lows)
  const max = Math.max(...days.map((day) => day.high))
  const span = Math.max(max - min, 1)

  return (
    <section className="panel weather-card" aria-labelledby="weather-title">
      <h2 id="weather-title" className="visually-hidden">
        {t('weather.title')}
      </h2>

      <div className="weather-now">
        <WeatherIcon kind={icon} className="weather-now-icon" aria-hidden="true" />
        <div>
          {weather.temperature != null && <p className="weather-now-temp">{formatDegrees(weather.temperature)}</p>}
          <p className="weather-now-label">{t(conditionKey)}</p>
        </div>
      </div>

      {hours.length > 0 && (
        <ol ref={hoursRef} className={`weather-hours ${edges}`} aria-label={t('weather.hours')}>
          {hours.map((hour) => (
            <li key={hour.time} className="weather-hour">
              <span className="weather-hour-time">{formatHour(hour.time, locale)}</span>
              <WeatherIcon kind={describeCondition(hour.condition).icon} width="22" height="22" aria-hidden="true" />
              <span className="visually-hidden">{t(describeCondition(hour.condition).key)}</span>
              <span className="weather-hour-temp">{formatDegrees(hour.temperature)}</span>
            </li>
          ))}
        </ol>
      )}

      {days.length > 0 && (
        <ol className="weather-days" aria-label={t('weather.days')}>
          {days.map((day) => {
            const low = day.low ?? day.high
            const condition = describeCondition(day.condition)
            return (
              <li key={day.date} className="weather-day">
                <span className="weather-day-name">{dayLabel(intl, day.date, now)}</span>
                <WeatherIcon kind={condition.icon} width="22" height="22" aria-hidden="true" />
                <span className="visually-hidden">{t(condition.key)}</span>
                <span className="weather-day-low">
                  <span className="visually-hidden">{t('weather.low')} </span>
                  {formatDegrees(low)}
                </span>
                <span
                  className="weather-day-bar"
                  aria-hidden="true"
                  style={{
                    '--from': `${((low - min) / span) * 100}%`,
                    '--to': `${((day.high - min) / span) * 100}%`,
                  }}
                />
                <span className="weather-day-high">
                  <span className="visually-hidden">{t('weather.high')} </span>
                  {formatDegrees(day.high)}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {stale ? <StaleNote updated={updated} /> : <p className="weather-source">{t('weather.updated', { time: formatHour(updated, locale) })}</p>}
    </section>
  )
}
