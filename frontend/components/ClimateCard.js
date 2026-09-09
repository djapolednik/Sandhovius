'use client'

import { temperatureColor } from '../lib/temperature'

export default function ClimateCard({ device, state, onToggle, isPending }) {
  const current = state?.local_temperature ?? state?.temperature
  const target = state?.occupied_heating_setpoint ?? state?.target_temperature
  const hasCurrent = typeof current === 'number'
  const hasTarget = typeof target === 'number'

  // How close current is to target, as a 0-1 "warmth" fraction for the
  // indicator bar — clamped, since current can overshoot target.
  const heatingIntensity =
    hasCurrent && hasTarget ? Math.max(0, Math.min(1, 1 - Math.abs(target - current) / 5)) : null

  return (
    <li className="card">
      <div className="device-card-header">
        <div>
          <div className="device-name">{device.name}</div>
          <div className="device-meta">{device.online ? 'Online' : 'Offline'}</div>
        </div>
        <button className="btn btn-secondary" onClick={onToggle} disabled={isPending}>
          {isPending ? 'Bezig' : 'Aan/uit'}
        </button>
      </div>

      {(hasCurrent || hasTarget) && (
        <div className="sensor-readings">
          {hasCurrent && (
            <div className="reading">
              <span className="reading-label">Huidig</span>
              <span className="reading-value" style={{ color: temperatureColor(current) }}>
                {current}°C
              </span>
            </div>
          )}
          {hasTarget && (
            <div className="reading">
              <span className="reading-label">Doel</span>
              <span className="reading-value">{target}°C</span>
            </div>
          )}
        </div>
      )}

      {heatingIntensity !== null && (
        <div className="heat-bar-track">
          <div className="heat-bar-fill" style={{ width: `${heatingIntensity * 100}%` }} />
        </div>
      )}

      {!hasCurrent && !hasTarget && <div className="reading-empty">Geen bekende meetwaarden</div>}
    </li>
  )
}
