'use client'

// Een lamp of stopcontact: de stand ("Aan"/"Uit") als grootste tekst van
// de tegel, daaronder een korte regel (soort apparaat, of de kamer als de
// tegel op Home staat), en onderin "Details". De tegel zelf blijft rustig;
// alleen de aan-knop rechtsboven licht groen op (zie DeviceCard).
export default function LightCard({ state, isOnline, offlineText = 'Offline', header, caption, Icon, footer }) {
  const raw = state?.state
  const isOn = raw === 'on'
  const isKnown = raw === 'on' || raw === 'off'

  return (
    <>
      {header}

      <div className="tile-state">
        {isOnline ? (
          <span className={`device-state-word ${isOn ? 'device-state-word-on' : ''}`}>
            {isKnown ? (isOn ? 'Aan' : 'Uit') : 'Onbekend'}
          </span>
        ) : (
          <>
            <span className="device-state-word device-state-word-offline">{offlineText}</span>
            {isKnown && <span className="device-state-sub">Laatst {isOn ? 'aan' : 'uit'}</span>}
          </>
        )}
        <span className="tile-caption">
          <Icon width="18" height="18" aria-hidden="true" />
          {caption}
        </span>
      </div>

      <div className="tile-bottom">{footer}</div>
    </>
  )
}
