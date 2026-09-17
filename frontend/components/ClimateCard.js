'use client'

import { temperatureColor } from '../lib/temperature'

// De doeltemperatuur is hier alleen af te lezen, niet in te stellen — dat
// kan alleen via de instellingen op de achterkant (lang indrukken van de
// kaart), zie DeviceCardBack.
export default function ClimateCard({ state, isOn, header }) {
  const attrs = state?.attributes ?? {}
  // Zigbee-achtige apparaten leggen dit plat in de state neer
  // (local_temperature/occupied_heating_setpoint); een echte Home
  // Assistant climate-entity draagt het genest onder attributes
  // (current_temperature/temperature) — beide worden ondersteund.
  const current = state?.local_temperature ?? attrs.current_temperature
  const target = state?.occupied_heating_setpoint ?? attrs.temperature
  const hasCurrent = typeof current === 'number'
  const hasTarget = typeof target === 'number'

  // How close current is to target, as a 0-1 "warmth" fraction for the
  // indicator bar — clamped, since current can overshoot target.
  const heatingIntensity =
    hasCurrent && hasTarget ? Math.max(0, Math.min(1, 1 - Math.abs(target - current) / 5)) : null

  return (
    <>
      {header}

      <div className={`status-line ${isOn ? 'status-on' : 'status-off'}`}>
        {isOn ? 'Ingeschakeld' : 'Uitgeschakeld'}
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
          <div
            className="heat-bar-fill"
            style={{
              width: `${heatingIntensity * 100}%`,
              // Het gradient staat op de vulling, maar moet ogen alsof het
              // over de hele track loopt (links altijd koud, rechts altijd
              // warm) — niet opnieuw uitgerekt over de eigen (krimpende/
              // groeiende) breedte van de vulling. Door het canvas te
              // schalen naar de volledige trackbreedte i.p.v. 100% van de
              // vulling zelf, verandert alleen hoeveel ervan zichtbaar is.
              backgroundSize: heatingIntensity > 0 ? `${100 / heatingIntensity}% 100%` : '100% 100%',
            }}
          />
        </div>
      )}

      {!hasCurrent && !hasTarget && <div className="reading-empty">Geen bekende meetwaarden</div>}
    </>
  )
}
