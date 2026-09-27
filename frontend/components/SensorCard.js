'use client'

import { formatTemperature, temperatureColor, readTemperature } from '../lib/temperature'
import { isBatteryLow } from '../lib/battery'

export default function SensorCard({ state, isOnline, offlineText = 'Offline', header }) {
  const occupancy = state?.occupancy ?? state?.motion
  const hasMotionReading = typeof occupancy === 'boolean'

  const temperature = readTemperature(state)
  const hasTemperatureReading = typeof temperature === 'number'

  const battery = state?.battery
  // Alleen melden als er iets te doen is: 90% batterij is geen nieuws.
  const batteryLow = isBatteryLow(battery)

  return (
    <>
      {header}

      {!isOnline && <div className="status-line status-offline">{offlineText} · laatst bekend</div>}

      {(hasMotionReading || hasTemperatureReading) && (
        <div className="sensor-readings">
          {hasTemperatureReading && (
            <div className="reading">
              <span className="reading-label">Temperatuur</span>
              <span className="reading-value reading-value-large" style={{ color: temperatureColor(temperature) }}>
                {formatTemperature(temperature)}
              </span>
            </div>
          )}
          {hasMotionReading && (
            // Beweging is gewoon leven in huis, geen alarm: neutrale tekst,
            // geen waarschuwingskleur.
            <div className="reading">
              <span className="reading-label">Beweging</span>
              <span className="reading-value">{occupancy ? 'Nu beweging' : 'Geen beweging'}</span>
            </div>
          )}
        </div>
      )}

      {!hasMotionReading && !hasTemperatureReading && (
        <div className="reading-empty">Nog geen meetwaarden ontvangen</div>
      )}

      {batteryLow && <div className="battery-badge battery-badge-low">Batterij bijna leeg · {battery}%</div>}
    </>
  )
}
