'use client'

import { useRef } from 'react'
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
  return (
    <p className="weather-stale">
      Niet bijgewerkt sinds {formatHour(updated)}. Heeft je Sandhovius-box internet?
    </p>
  )
}

// Telefoon: een rustige regel in het huis-paneel.
export function WeatherLine({ weather, updated, now }) {
  const { label, icon } = describeCondition(weather.condition)
  const today = upcomingDays(weather, now, 1)[0]
  const stale = isWeatherStale(updated, now)

  return (
    <div className="weather-line">
      <WeatherIcon kind={icon} className="weather-line-icon" aria-hidden="true" />
      <div className="weather-line-text">
        <p className="weather-line-now">
          {label}
          {weather.temperature != null && `, ${formatDegrees(weather.temperature)}`}
        </p>
        {stale ? (
          <StaleNote updated={updated} />
        ) : (
          today?.low != null && (
            <p className="weather-line-meta">
              Vandaag {formatDegrees(today.low)} tot {formatDegrees(today.high)}
            </p>
          )
        )}
      </div>
    </div>
  )
}

// Breed scherm: een eigen kaart onder het huis-paneel. Nu groot, dan de
// komende uren als strook en de komende dagen met een temperatuurbalk: van
// de laagste tot de hoogste temperatuur, op de schaal van de hele week.
export function WeatherCard({ weather, updated, now }) {
  const hoursRef = useRef(null)
  const { label, icon } = describeCondition(weather.condition)
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
        Weer
      </h2>

      <div className="weather-now">
        <WeatherIcon kind={icon} className="weather-now-icon" aria-hidden="true" />
        <div>
          {weather.temperature != null && <p className="weather-now-temp">{formatDegrees(weather.temperature)}</p>}
          <p className="weather-now-label">{label}</p>
        </div>
      </div>

      {hours.length > 0 && (
        <ol ref={hoursRef} className={`weather-hours ${edges}`} aria-label="De komende uren">
          {hours.map((hour) => (
            <li key={hour.time} className="weather-hour">
              <span className="weather-hour-time">{formatHour(hour.time)}</span>
              <WeatherIcon kind={describeCondition(hour.condition).icon} width="22" height="22" aria-hidden="true" />
              <span className="visually-hidden">{describeCondition(hour.condition).label}</span>
              <span className="weather-hour-temp">{formatDegrees(hour.temperature)}</span>
            </li>
          ))}
        </ol>
      )}

      {days.length > 0 && (
        <ol className="weather-days" aria-label="De komende dagen">
          {days.map((day) => {
            const low = day.low ?? day.high
            const condition = describeCondition(day.condition)
            return (
              <li key={day.date} className="weather-day">
                <span className="weather-day-name">{dayLabel(day.date, now)}</span>
                <WeatherIcon kind={condition.icon} width="22" height="22" aria-hidden="true" />
                <span className="visually-hidden">{condition.label}</span>
                <span className="weather-day-low">
                  <span className="visually-hidden">laagste </span>
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
                  <span className="visually-hidden">hoogste </span>
                  {formatDegrees(day.high)}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {stale ? <StaleNote updated={updated} /> : <p className="weather-source">Bijgewerkt om {formatHour(updated)}</p>}
    </section>
  )
}
