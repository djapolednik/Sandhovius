'use client'

// Een lamp of stopcontact: bovenin het apparaat als groot icoon, dan de
// naam, de stand ("Aan"/"Uit") als grootste tekst, een korte regel (soort
// apparaat, of de kamer als de tegel op Home staat) en onderin "Details".
// Staat hij aan, dan licht de tegel op vanachter het icoon — warm bij een
// lamp, stroomblauw bij een stopcontact — langzaam aan, langzaam uit,
// zoals een echte lamp (zie .card-lit).
export default function LightCard({
  state,
  isOnline,
  isPending = false,
  offlineText = 'Offline',
  header,
  caption,
  Icon,
  footer,
}) {
  const raw = state?.state
  const isOn = raw === 'on'
  const isKnown = raw === 'on' || raw === 'off'

  return (
    <>
      <span className="lamp-visual" aria-hidden="true">
        <Icon width="36" height="36" />
      </span>

      {header}

      <div className="tile-state">
        {isOnline ? (
          <span className={`device-state-word ${isOn ? 'device-state-word-on' : ''}`}>
            {/* "Aan…" zolang de box het nog niet bevestigd heeft. */}
            {isKnown ? (isOn ? 'Aan' : 'Uit') + (isPending ? '…' : '') : 'Onbekend'}
          </span>
        ) : (
          <>
            <span className="device-state-word device-state-word-offline">{offlineText}</span>
            {isKnown && <span className="device-state-sub">Laatst {isOn ? 'aan' : 'uit'}</span>}
          </>
        )}
        <span className="tile-caption">{caption}</span>
      </div>

      <div className="tile-bottom">{footer}</div>
    </>
  )
}
