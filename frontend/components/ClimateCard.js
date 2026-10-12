'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { formatTemperature } from '../lib/temperature'
import { MinusIcon, PlusIcon } from '../lib/icons'

const TEMP_STEP = 0.5
// Zo lang na de laatste tik op −/+ gaat er pas een commando naar de box:
// vijf keer tikken van 19 naar 21,5 is één instelling, niet vijf.
const COMMIT_DELAY_MS = 800
// Binnen deze marge noemen we een ruimte "op temperatuur"; thermostaten
// schommelen altijd een paar tienden rond het doel.
const AT_TARGET_MARGIN = 0.3

// De draaiknop: een boog van 270°, open aan de onderkant, van min naar max.
const DIAL_SIZE = 200
const DIAL_RADIUS = 84
const DIAL_SWEEP = 270
const DIAL_START = 135 // graden, 0 = rechts, met de klok mee
const CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS
const ARC_LENGTH = (DIAL_SWEEP / 360) * CIRCUMFERENCE

function pointOnDial(fraction) {
  const angle = ((DIAL_START + DIAL_SWEEP * fraction) * Math.PI) / 180
  return {
    x: DIAL_SIZE / 2 + DIAL_RADIUS * Math.cos(angle),
    y: DIAL_SIZE / 2 + DIAL_RADIUS * Math.sin(angle),
  }
}

// Een thermostaat is een thermostaat, geen lichtschakelaar: een compacte
// draaiknop met het doel groot en hoe warm het nu is, met − en + ernaast.
// Aan of uit is één schakelaar onderin ("Verwarming", met de status
// eronder) — nooit het gevolg van een tik op het paneel zelf. Staat hij
// uit, dan is het paneel rustig: grijze boog, geen blauw vlak.
export default function ClimateCard({
  state,
  isOn,
  isOnline,
  offlineText = 'Offline',
  onSetTemperature,
  onToggleHeating,
}) {
  const attrs = state?.attributes ?? {}
  // Zigbee-achtige apparaten leggen dit plat in de state neer
  // (local_temperature/occupied_heating_setpoint); een echte Home
  // Assistant climate-entity draagt het genest onder attributes
  // (current_temperature/temperature) — beide worden ondersteund.
  const current = state?.local_temperature ?? attrs.current_temperature
  const target = state?.occupied_heating_setpoint ?? attrs.temperature
  const hasCurrent = typeof current === 'number'
  const hasTarget = typeof target === 'number'
  const minTemp = typeof attrs.min_temp === 'number' ? attrs.min_temp : 10
  const maxTemp = typeof attrs.max_temp === 'number' ? attrs.max_temp : 30

  // Het doel dat je aan het instellen bent, vóórdat het commando weg is.
  // De ref spiegelt de state zodat de timer en de unmount-flush altijd de
  // nieuwste waarde versturen.
  const [pendingTarget, setPendingTarget] = useState(null)
  // Wat een schermlezer hoort: het doel pas als je klaar bent met tikken,
  // niet elke halve graad onderweg.
  const [announced, setAnnounced] = useState('')
  const pendingRef = useRef(null)
  const commitTimer = useRef(null)
  const onSetRef = useRef(onSetTemperature)
  // Na de render bijwerken, niet tijdens (React 19): gelezen in handlers en timers.
  useLayoutEffect(() => {
    onSetRef.current = onSetTemperature
  })

  function commit() {
    clearTimeout(commitTimer.current)
    commitTimer.current = null
    const value = pendingRef.current
    pendingRef.current = null
    setPendingTarget(null)
    if (value !== null) {
      setAnnounced(`Doeltemperatuur ${formatTemperature(value)}`)
      onSetRef.current?.(value)
    }
  }

  // Wie de kaart verlaat (kamer wisselen) midden in het bijstellen,
  // verliest die instelling niet.
  useEffect(
    () => () => {
      if (pendingRef.current !== null) commit()
    },
    []
  )

  const shownTarget = pendingTarget ?? target
  const powerId = useId()
  // Een doel instellen voor een verwarming die uit staat doet niets: −/+
  // pas als hij aan staat ("Verwarming uit" staat er dan tussen).
  const canAdjust = isOn && isOnline && hasTarget && typeof onSetTemperature === 'function'
  const canSwitch = isOnline && typeof onToggleHeating === 'function'

  function adjust(delta) {
    // Vanaf de ref, niet vanaf de render: twee snelle tikken tussen twee
    // renders mogen niet op dezelfde waarde landen.
    const base = pendingRef.current ?? shownTarget
    const next = Math.min(maxTemp, Math.max(minTemp, Math.round((base + delta) * 2) / 2))
    if (next === base) return
    pendingRef.current = next
    setPendingTarget(next)
    clearTimeout(commitTimer.current)
    commitTimer.current = setTimeout(commit, COMMIT_DELAY_MS)
  }



  let status
  if (!isOnline) status = `${offlineText}, laatst bekende stand`
  else if (!isOn) status = 'Verwarming uit'
  else if (hasCurrent && hasTarget && current < shownTarget - AT_TARGET_MARGIN) status = 'Verwarmt'
  else if (hasCurrent && hasTarget) status = 'Op temperatuur'
  else status = null

  const clamp = (v) => Math.max(0, Math.min(1, (v - minTemp) / (maxTemp - minTemp)))
  const targetFraction = hasTarget ? clamp(shownTarget) : 0
  const knob = pointOnDial(targetFraction)
  const currentMark = hasCurrent ? pointOnDial(clamp(current)) : null
  const isHeating = status === 'Verwarmt'

  const stepButton = (label, delta, disabled, Icon) => (
    <button
      type="button"
      className="climate-step"
      aria-label={label}
      disabled={disabled}
      onClick={() => adjust(delta)}
    >
      <Icon width="22" height="22" />
    </button>
  )

  if (!hasCurrent && !hasTarget) return <p className="reading-empty">Nog geen meetwaarden ontvangen</p>

  return (
    <div className="climate-layout">
      <div className="climate-dial-row">
        {hasTarget && stepButton('Kouder', -TEMP_STEP, !canAdjust || shownTarget <= minTemp, MinusIcon)}

        {/* Blauwe boog zolang de verwarming aan staat; de gloed alleen als
            hij echt verwarmt (Real Light Rule), niet bij "Op temperatuur". */}
        <div className={`dial ${isOn && isOnline ? '' : 'dial-idle'} ${isHeating ? 'dial-live' : ''}`}>
          <svg className="dial-svg" viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`} aria-hidden="true">
            <circle
              className="dial-track"
              cx={DIAL_SIZE / 2}
              cy={DIAL_SIZE / 2}
              r={DIAL_RADIUS}
              strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
              transform={`rotate(${DIAL_START} ${DIAL_SIZE / 2} ${DIAL_SIZE / 2})`}
            />
            {hasTarget && (
              <>
                <circle
                  className="dial-value"
                  cx={DIAL_SIZE / 2}
                  cy={DIAL_SIZE / 2}
                  r={DIAL_RADIUS}
                  strokeDasharray={`${ARC_LENGTH * targetFraction} ${CIRCUMFERENCE}`}
                  transform={`rotate(${DIAL_START} ${DIAL_SIZE / 2} ${DIAL_SIZE / 2})`}
                />
                <circle className="dial-knob" cx={knob.x} cy={knob.y} r="9" />
              </>
            )}
            {currentMark && <circle className="dial-current" cx={currentMark.x} cy={currentMark.y} r="3.5" />}
          </svg>

          <div className="dial-center">
            {hasTarget && (
              <>
                <span className="dial-target">
                  <span className="visually-hidden">Doeltemperatuur </span>
                  {formatTemperature(shownTarget)}
                </span>
                <span className="visually-hidden" aria-live="polite">
                  {announced}
                </span>
              </>
            )}
            {hasCurrent && (
              <span className="dial-now">
                Nu <span>{formatTemperature(current)}</span>
              </span>
            )}
          </div>
        </div>

        {hasTarget && stepButton('Warmer', TEMP_STEP, !canAdjust || shownTarget >= maxTemp, PlusIcon)}
      </div>

      {/* Eén schakelaar: aan of uit is apparaatstand, dus het "aan"-groen
          (zoals elke stand), geen blauw vlak. De status staat eronder, zodat
          het paneel geen aparte regel nodig heeft. Offline blijft hij
          focusbaar (aria-disabled), zodat je de stand kunt horen. */}
      <div className="climate-power">
        <span className="climate-power-text">
          <span id={powerId}>Verwarming</span>
          {status && (
            <span className={`climate-status ${isHeating ? 'climate-status-heating' : ''}`}>{status}</span>
          )}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          aria-labelledby={powerId}
          aria-disabled={canSwitch ? undefined : true}
          className={`switch ${isOn ? 'switch-on' : ''}`}
          onClick={() => canSwitch && onToggleHeating()}
        >
          <span className="switch-thumb" />
        </button>
      </div>
    </div>
  )
}
