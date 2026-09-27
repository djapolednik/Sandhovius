'use client'

// De kaart ís de schakelaar: "Aan"/"Uit" is de grootste tekst, en de hele
// kaart kleurt mee (zie .card-on). Het schakelaartje rechtsonder is puur
// visueel — het vertelt een nieuwe gebruiker dat tikken schakelt; de echte
// knop met aria-pressed is de kaart zelf (zie DeviceCard).
export default function LightCard({ state, isOnline, offlineText = 'Offline', header }) {
  const raw = state?.state
  const isOn = raw === 'on'
  const isKnown = raw === 'on' || raw === 'off'

  if (!isOnline) {
    return (
      <>
        {header}
        <div className="device-state-row">
          <div className="device-state">
            <span className="device-state-word device-state-word-offline">{offlineText}</span>
            {isKnown && <span className="device-state-sub">Laatst {isOn ? 'aan' : 'uit'}</span>}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {header}
      <div className="device-state-row">
        <div className="device-state">
          <span className={`device-state-word ${isOn ? 'device-state-word-on' : ''}`}>
            {isKnown ? (isOn ? 'Aan' : 'Uit') : 'Onbekend'}
          </span>
        </div>
        {isKnown && (
          <span className={`switch switch-indicator ${isOn ? 'switch-on' : ''}`} aria-hidden="true">
            <span className="switch-thumb" />
          </span>
        )}
      </div>
    </>
  )
}
