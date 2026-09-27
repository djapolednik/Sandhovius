'use client'

import { PowerIcon } from '../lib/icons'

// De tegel ís de schakelaar: onderin staat "Aan"/"Uit" als grootste tekst,
// met de ronde aan-knop die groen oplicht (Signal Green met een zwart
// symbool). Die knop is puur visueel — hij vertelt een nieuwe gebruiker
// dat tikken schakelt; de echte knop met aria-pressed is de hele tegel
// (zie DeviceCard).
export default function LightCard({ state, isOnline, offlineText = 'Offline', header, Icon }) {
  const raw = state?.state
  const isOn = raw === 'on'
  const isKnown = raw === 'on' || raw === 'off'

  return (
    <>
      {header}

      <div className="tile-visual">
        <span className="device-icon device-icon-large">
          <Icon width="30" height="30" />
        </span>
      </div>

      <div className="device-state-row">
        {isOnline ? (
          <>
            <span className={`device-state-word ${isOn ? 'device-state-word-on' : ''}`}>
              {isKnown ? (isOn ? 'Aan' : 'Uit') : 'Onbekend'}
            </span>
            {isKnown && (
              <span className={`power-indicator ${isOn ? 'power-indicator-on' : ''}`} aria-hidden="true">
                <PowerIcon />
              </span>
            )}
          </>
        ) : (
          <span className="device-state">
            <span className="device-state-word device-state-word-offline">{offlineText}</span>
            {isKnown && <span className="device-state-sub">Laatst {isOn ? 'aan' : 'uit'}</span>}
          </span>
        )}
      </div>
    </>
  )
}
