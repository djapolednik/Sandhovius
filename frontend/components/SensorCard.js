'use client'

import { temperatureColor } from '../lib/temperature'

export default function SensorCard({ device, state }) {
  const occupancy = state?.occupancy ?? state?.motion
  const hasMotionReading = typeof occupancy === 'boolean'

  const temperature = state?.temperature ?? state?.local_temperature
  const hasTemperatureReading = typeof temperature === 'number'

  const battery = state?.battery
  const hasBattery = typeof battery === 'number'

  return (
    <li className="card">
      <div className="device-card-header">
        <div>
          <div className="device-name">{device.name}</div>
          <div className="device-meta">{device.online ? 'Online' : 'Offline'}</div>
        </div>
        {hasBattery && <div className="battery-badge">{battery}% batterij</div>}
      </div>

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
    </li>
  )
}
