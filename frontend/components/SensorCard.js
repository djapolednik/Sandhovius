'use client'

import { formatTemperature, temperatureColor, readTemperature } from '../lib/temperature'
import { isBatteryLow } from '../lib/battery'

// Een sensor laat zijn meting zien, dat is waarvoor je kijkt: de
// temperatuur groot, beweging als gewone zin. Een tik op de tegel opent de
// details (alle metingen, favoriet, naam en kamer).
export default function SensorCard({ state, isOnline, offlineText = 'Offline', header, caption, Icon }) {
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

      <div className="tile-state">
        {hasTemperatureReading && (
          <span className="reading-value reading-value-hero" style={{ color: temperatureColor(temperature) }}>
            {formatTemperature(temperature)}
          </span>
        )}
        {hasMotionReading && (
          // Beweging is gewoon leven in huis, geen alarm: neutrale tekst.
          <span className={hasTemperatureReading ? 'sensor-line' : 'reading-value reading-value-hero-text'}>
            {occupancy ? 'Er is nu beweging' : 'Geen beweging'}
          </span>
        )}
        {!hasMotionReading && !hasTemperatureReading && (
          <span className="reading-empty">Nog geen meetwaarden ontvangen</span>
        )}
        <span className="tile-caption">
          <Icon width="18" height="18" aria-hidden="true" />
          {caption}
        </span>
      </div>

      {(!isOnline || batteryLow) && (
        <div className="tile-notes">
          {!isOnline && <span className="status-offline">{offlineText}, laatst bekende stand</span>}
          {batteryLow && <span className="battery-badge battery-badge-low">Batterij bijna leeg ({battery}%)</span>}
        </div>
      )}
    </>
  )
}
