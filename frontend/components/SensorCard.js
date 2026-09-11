'use client'

import { temperatureColor, readTemperature } from '../lib/temperature'

export default function SensorCard({ device, state, header }) {
  const occupancy = state?.occupancy ?? state?.motion
  const hasMotionReading = typeof occupancy === 'boolean'

  const temperature = readTemperature(state)
  const hasTemperatureReading = typeof temperature === 'number'

  const battery = state?.battery
  const hasBattery = typeof battery === 'number'

  return (
    <>
      {header}

      {hasBattery && <div className="battery-badge">{battery}% batterij</div>}

      {(hasMotionReading || hasTemperatureReading) && (
        <div className="sensor-readings">
          {hasMotionReading && (
            <div className="reading">
              <span className="reading-label">Beweging</span>
              <span className={`reading-value ${occupancy ? 'reading-alert' : ''}`}>
                {occupancy ? 'Ja' : 'Nee'}
              </span>
            </div>
          )}
          {hasTemperatureReading && (
            <div className="reading">
              <span className="reading-label">Temperatuur</span>
              <span className="reading-value" style={{ color: temperatureColor(temperature) }}>
                {temperature}°C
              </span>
            </div>
          )}
        </div>
      )}

      {!hasMotionReading && !hasTemperatureReading && (
        <div className="reading-empty">Geen bekende meetwaarden</div>
      )}
    </>
  )
}
