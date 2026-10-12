'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  brightnessLabel,
  capabilities,
  controlsVisible,
  createHoldOff,
  currentRgb,
  initialMode,
  kelvinLabel,
  kelvinToRgb,
  payloadFor,
  percentFromBrightness,
  swatchSelected,
  throttle,
} from '../lib/light'

// Dimmen, wit en kleur van één lamp, in de detail-sheet onder "Stand". Alleen
// wat de lamp kan: een lamp zonder dimmen krijgt niets, een lamp met wit én
// kleur een pillenbalk Wit / Kleur. Elke schuif stuurt hooguit één commando
// per 400 ms tijdens het slepen en het laatste bij loslaten. Op een lamp die
// uit staat zet elke waarde de lamp aan (turn_on met die waarde).
const SEND_EVERY_MS = 400
// Na een eigen wijziging negeren we de lamp-stand even (echo van je commando).
const HOLD_OFF_MS = 1000

// Zes stalen, geen kleurenwiel: de rest zit achter "Meer kleuren".
const SWATCHES = [
  { name: 'Rood', rgb: [255, 59, 48] },
  { name: 'Oranje', rgb: [255, 149, 0] },
  { name: 'Geel', rgb: [255, 214, 10] },
  { name: 'Groen', rgb: [52, 199, 89] },
  { name: 'Blauw', rgb: [10, 132, 255] },
  { name: 'Paars', rgb: [175, 82, 222] },
]

const toHex = (rgb) => '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')
const fromHex = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const sameRgb = (a, b) => a && b && a.every((c, i) => Math.abs(c - b[i]) < 2)

export default function LightControls({ device, state, disabled, onChange }) {
  const attributes = state?.attributes
  const caps = capabilities(attributes)
  const hasKelvin = caps.white && caps.minKelvin !== null && caps.maxKelvin !== null

  const attrPercent = percentFromBrightness(attributes?.brightness)
  const attrKelvin = Number.isFinite(attributes?.color_temp_kelvin) ? attributes.color_temp_kelvin : null
  const attrRgb = currentRgb(attributes)

  const [percent, setPercent] = useState(attrPercent ?? 100)
  const [kelvin, setKelvin] = useState(attrKelvin ?? (hasKelvin ? Math.round((caps.minKelvin + caps.maxKelvin) / 2) : 3000))
  const [rgb, setRgb] = useState(attrRgb)
  const [mode, setMode] = useState(initialMode(attributes))
  const hold = useRef(createHoldOff(HOLD_OFF_MS))
  // Loopt het hold-off af, dan nog één keer de stand volgen: is je commando
  // in die tijd mislukt, dan springt de schuif zo alsnog terug.
  const [holdEnded, setHoldEnded] = useState(0)
  // De color_mode waar de Wit/Kleur-balk het laatst op is gezet: alleen een
  // echte wissel van de lamp zet de balk om, niet elke nieuwe stand (je kunt
  // op "Kleur" staan kijken terwijl de lamp nog wit brandt).
  const syncedColorMode = useRef(attributes?.color_mode)

  // De echte stand van de lamp volgt, behalve vlak na een eigen wijziging:
  // anders springt de schuif terug naar de waarde van een commando van daarnet.
  useEffect(() => {
    if (hold.current.active()) {
      const timer = setTimeout(() => setHoldEnded((n) => n + 1), hold.current.remaining() + 50)
      return () => clearTimeout(timer)
    }
    if (attrPercent !== null) setPercent(attrPercent)
    if (attrKelvin !== null) setKelvin(attrKelvin)
    if (attrRgb) setRgb(attrRgb)
    if (attributes?.color_mode && attributes.color_mode !== syncedColorMode.current) {
      syncedColorMode.current = attributes.color_mode
      setMode(initialMode(attributes))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attrPercent, attrKelvin, attrRgb?.join(','), attributes?.color_mode, holdEnded])

  // De throttle leeft zo lang de sheet; de nieuwste onChange via een ref.
  const send = useRef(onChange)
  useLayoutEffect(() => {
    send.current = onChange
  })
  // Pas aangemaakt bij de eerste wijziging (een handler), niet tijdens de render.
  const limiterRef = useRef(null)
  function limiter() {
    if (!limiterRef.current) limiterRef.current = throttle((payload) => send.current(payload), SEND_EVERY_MS)
    return limiterRef.current
  }
  useEffect(() => () => limiterRef.current?.flush(), [])

  // Elke eigen wijziging gaat hier langs: het hold-off loopt vanaf de laatste.
  function emit(payload) {
    hold.current.touch()
    limiter().call(payload)
  }
  function release() {
    hold.current.touch()
    limiter().flush()
  }
  const dragProps = {
    onPointerUp: release,
    onPointerCancel: release,
    onBlur: release,
    onKeyUp: release,
  }

  function pickRgb(next, immediate) {
    setRgb(next)
    setMode('colour')
    emit(payloadFor({ rgb: next }))
    if (immediate) limiter().flush()
  }

  // De Wit/Kleur-balk wisselt alleen het beeld; pas een gekozen waarde of een
  // schuif stuurt een commando (anders zet een tik op "Kleur" de lamp aan).
  function pickMode(next) {
    setMode(next)
  }

  if (!caps.dim || !controlsVisible(state)) return null

  const showBar = hasKelvin && caps.colour
  const showWhite = hasKelvin && (!caps.colour || mode === 'white')
  const showColour = caps.colour && (!hasKelvin || mode === 'colour')
  const track = hasKelvin
    ? `linear-gradient(90deg, rgb(${kelvinToRgb(caps.minKelvin).join(',')}), rgb(${kelvinToRgb(caps.maxKelvin).join(',')}))`
    : undefined
  const isCustom = !!rgb && state?.state === 'on' && !SWATCHES.some((s) => sameRgb(s.rgb, rgb))

  return (
    <div className="light-controls">
      <label className="light-slider">
        <span className="light-slider-head">
          <span className="form-label">Helderheid</span>
          <span className="reading-value">{brightnessLabel(state, percent)}</span>
        </span>
        <input
          type="range"
          className="light-range"
          min="1"
          max="100"
          step="1"
          value={percent}
          disabled={disabled}
          aria-valuetext={state?.state === 'on' ? `${percent} procent` : 'uit'}
          style={{ '--fill': `${percent}%` }}
          onChange={(e) => {
            const next = Number(e.target.value)
            setPercent(next)
            emit(payloadFor({ brightnessPct: next }))
          }}
          {...dragProps}
        />
      </label>

      {showBar && (
        <fieldset className="segmented segmented-small light-mode" disabled={disabled}>
          <legend className="visually-hidden">Wit of kleur</legend>
          {[
            ['white', 'Wit'],
            ['colour', 'Kleur'],
          ].map(([value, label]) => (
            <label key={value} className={`segmented-option ${mode === value ? 'segmented-option-selected' : ''}`}>
              <input
                type="radio"
                name={`light-mode-${device.id}`}
                value={value}
                className="visually-hidden"
                checked={mode === value}
                onChange={() => pickMode(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>
      )}

      {showWhite && (
        <label className="light-slider">
          <span className="light-slider-head">
            <span className="form-label">Wit</span>
            <span className="reading-value">{kelvinLabel(state, kelvin)}</span>
          </span>
          <input
            type="range"
            className="light-range light-range-track"
            min={caps.minKelvin}
            max={caps.maxKelvin}
            step="50"
            value={Math.min(caps.maxKelvin, Math.max(caps.minKelvin, kelvin))}
            disabled={disabled}
            aria-valuetext={state?.state === 'on' ? `${kelvin} kelvin` : 'uit'}
            style={{ '--track': track }}
            onChange={(e) => {
              const next = Number(e.target.value)
              setKelvin(next)
              setMode('white')
              emit(payloadFor({ kelvin: next }))
            }}
            {...dragProps}
          />
        </label>
      )}

      {showColour && (
        <div className="light-swatches" role="group" aria-label="Kleur">
          {SWATCHES.map((swatch) => {
            const selected = mode === 'colour' && swatchSelected(state, swatch.rgb)
            return (
              <button
                key={swatch.name}
                type="button"
                className={`light-swatch ${selected ? 'light-swatch-selected' : ''}`}
                style={{ '--swatch': toHex(swatch.rgb) }}
                aria-label={swatch.name}
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => pickRgb(swatch.rgb, true)}
              />
            )
          })}
          <label
            className={`light-more ${isCustom && mode === 'colour' ? 'light-more-selected' : ''} ${disabled ? 'light-more-disabled' : ''}`}
          >
            <input
              type="color"
              className="light-more-input"
              value={toHex(rgb ?? SWATCHES[0].rgb)}
              disabled={disabled}
              aria-label="Meer kleuren"
              onChange={(e) => pickRgb(fromHex(e.target.value), false)}
              {...dragProps}
            />
            <span>Meer kleuren</span>
          </label>
        </div>
      )}
    </div>
  )
}
