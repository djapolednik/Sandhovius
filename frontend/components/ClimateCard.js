'use client'

import { useEffect, useRef, useState } from 'react'
import { formatTemperature, temperatureColor } from '../lib/temperature'
import { MinusIcon, PlusIcon } from '../lib/icons'

const TEMP_STEP = 0.5
// Zo lang na de laatste tik op −/+ gaat er pas een commando naar de box:
// vijf keer tikken van 19 naar 21,5 is één instelling, niet vijf.
const COMMIT_DELAY_MS = 800
// Binnen deze marge noemen we een ruimte "op temperatuur"; thermostaten
// schommelen altijd een paar tienden rond het doel.
const AT_TARGET_MARGIN = 0.3

// Een thermostaat is een thermostaat, geen lichtschakelaar: de voorkant
// toont hoe warm het nu is en laat het doel direct bijstellen. Verwarming
// helemaal uit/aan is zeldzaam en staat daarom in de instellingen (gear-knop).
export default function ClimateCard({ state, isOn, isOnline, offlineText = 'Offline', header, onSetTemperature }) {
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
  const pendingRef = useRef(null)
  const commitTimer = useRef(null)
  const onSetRef = useRef(onSetTemperature)
  onSetRef.current = onSetTemperature

  function commit() {
    clearTimeout(commitTimer.current)
    commitTimer.current = null
    const value = pendingRef.current
    pendingRef.current = null
    setPendingTarget(null)
    if (value !== null) onSetRef.current?.(value)
  }

  // Wie de kaart verlaat (kamer wisselen, omdraaien) midden in het
  // bijstellen, verliest die instelling niet.
  useEffect(() => () => {
    if (pendingRef.current !== null) commit()
  }, [])

  const shownTarget = pendingTarget ?? target
  const canAdjust = isOnline && hasTarget && typeof onSetTemperature === 'function'

  function adjust(delta) {
    const next = Math.min(maxTemp, Math.max(minTemp, Math.round((shownTarget + delta) * 2) / 2))
    if (next === shownTarget) return
    pendingRef.current = next
    setPendingTarget(next)
    clearTimeout(commitTimer.current)
    commitTimer.current = setTimeout(commit, COMMIT_DELAY_MS)
  }

  let status
  if (!isOnline) status = { text: `${offlineText} · laatst bekend`, tone: 'offline' }
  else if (!isOn) status = { text: 'Verwarming uit', tone: 'off' }
  else if (hasCurrent && hasTarget && current < shownTarget - AT_TARGET_MARGIN) status = { text: 'Verwarmt', tone: 'heating' }
  else if (hasCurrent && hasTarget) status = { text: 'Op temperatuur', tone: 'idle' }
  else status = null

  return (
    <>
      {header}

      {status && <div className={`status-line climate-status climate-status-${status.tone}`}>{status.text}</div>}

      <div className="climate-body">
        {hasCurrent && (
          <div className="climate-now">
            <span className="reading-label">Nu</span>
            <span className="climate-now-value" style={{ color: temperatureColor(current) }}>
              {formatTemperature(current)}
            </span>
          </div>
        )}

        {hasTarget && (
          // Eigen pointerdown-stop: ingedrukt houden op −/+ mag niet de
          // instellingen openen (zie de long-press in DeviceCard).
          <div className="climate-target" onPointerDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="climate-step"
              aria-label="Kouder"
              disabled={!canAdjust || shownTarget <= minTemp}
              onClick={() => adjust(-TEMP_STEP)}
            >
              <MinusIcon width="22" height="22" />
            </button>
            <div className="climate-target-value">
              <span className="reading-label">Doel</span>
              <span className="reading-value" aria-live="polite" aria-atomic="true">
                <span className="visually-hidden">Doeltemperatuur </span>
                {formatTemperature(shownTarget)}
              </span>
            </div>
            <button
              type="button"
              className="climate-step"
              aria-label="Warmer"
              disabled={!canAdjust || shownTarget >= maxTemp}
              onClick={() => adjust(TEMP_STEP)}
            >
              <PlusIcon width="22" height="22" />
            </button>
          </div>
        )}
      </div>

      {!hasCurrent && !hasTarget && <div className="reading-empty">Nog geen meetwaarden ontvangen</div>}
    </>
  )
}
