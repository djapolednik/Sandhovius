'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { capabilities, kelvinToRgb, payloadFor, percentFromBrightness, throttle } from '../lib/light'

// Dimmen, wit en kleur van één lamp, in de detail-sheet onder "Stand". Alleen
// wat de lamp kan: een lamp zonder dimmen krijgt niets, een lamp met wit én
// kleur een pillenbalk Wit / Kleur. Elke schuif stuurt hooguit één commando
// per 400 ms tijdens het slepen en het laatste bij loslaten. Op een lamp die
// uit staat zet elke waarde de lamp aan (turn_on met die waarde).
const SEND_EVERY_MS = 400

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
  const attrRgb = Array.isArray(attributes?.rgb_color) && attributes.rgb_color.length === 3 ? attributes.rgb_color : null

  const [percent, setPercent] = useState(attrPercent ?? 100)
  const [kelvin, setKelvin] = useState(attrKelvin ?? (hasKelvin ? Math.round((caps.minKelvin + caps.maxKelvin) / 2) : 3000))
  const [rgb, setRgb] = useState(attrRgb ?? SWATCHES[0].rgb)
  const [mode, setMode] = useState(attributes?.color_mode === 'color_temp' || !caps.colour ? 'white' : 'colour')
  const dragging = useRef(false)

  // De echte stand van de lamp volgt, behalve terwijl je sleept: anders
  // springt de schuif terug naar de waarde van een commando van daarnet.
  useEffect(() => {
    if (dragging.current) return
    if (attrPercent !== null) setPercent(attrPercent)
    if (attrKelvin !== null) setKelvin(attrKelvin)
    if (attrRgb) setRgb(attrRgb)
    if (attributes?.color_mode === 'color_temp') setMode('white')
    else if (caps.colour && attributes?.color_mode) setMode('colour')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attrPercent, attrKelvin, attrRgb?.join(','), attributes?.color_mode])

  // De throttle leeft zo lang de sheet; de nieuwste onChange via een ref.
  const send = useRef(onChange)
  send.current = onChange
  const limiter = useMemo(() => throttle((payload) => send.current(payload), SEND_EVERY_MS), [])
  useEffect(() => () => limiter.flush(), [limiter])

  function release() {
    dragging.current = false
    limiter.flush()
  }
  const dragProps = {
    onPointerDown: () => {
      dragging.current = true
    },
    onPointerUp: release,
    onPointerCancel: release,
    onBlur: release,
    onKeyUp: release,
  }

  function pickRgb(next, immediate) {
    setRgb(next)
    setMode('colour')
    limiter.call(payloadFor({ rgb: next }))
    if (immediate) limiter.flush()
  }

  function pickMode(next) {
    setMode(next)
    limiter.call(next === 'white' ? payloadFor({ kelvin }) : payloadFor({ rgb }))
    limiter.flush()
  }

  if (!caps.dim) return null

  const showBar = hasKelvin && caps.colour
  const showWhite = hasKelvin && (!caps.colour || mode === 'white')
  const showColour = caps.colour && (!hasKelvin || mode === 'colour')
  const track = hasKelvin
    ? `linear-gradient(90deg, rgb(${kelvinToRgb(caps.minKelvin).join(',')}), rgb(${kelvinToRgb(caps.maxKelvin).join(',')}))`
    : undefined
  const isCustom = !SWATCHES.some((s) => sameRgb(s.rgb, rgb))

  return (
    <div className="light-controls">
      <label className="light-slider">
        <span className="light-slider-head">
          <span className="form-label">Helderheid</span>
          <span className="reading-value">{percent}%</span>
        </span>
        <input
          type="range"
          className="light-range"
          min="1"
          max="100"
          step="1"
          value={percent}
          disabled={disabled}
          aria-valuetext={`${percent} procent`}
          style={{ '--fill': `${percent}%` }}
          onChange={(e) => {
            const next = Number(e.target.value)
            setPercent(next)
            limiter.call(payloadFor({ brightnessPct: next }))
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
            <span className="reading-value">{kelvin} K</span>
          </span>
          <input
            type="range"
            className="light-range light-range-track"
            min={caps.minKelvin}
            max={caps.maxKelvin}
            step="50"
            value={Math.min(caps.maxKelvin, Math.max(caps.minKelvin, kelvin))}
            disabled={disabled}
            aria-valuetext={`${kelvin} kelvin`}
            style={{ '--track': track }}
            onChange={(e) => {
              const next = Number(e.target.value)
              setKelvin(next)
              setMode('white')
              limiter.call(payloadFor({ kelvin: next }))
            }}
            {...dragProps}
          />
        </label>
      )}

      {showColour && (
        <div className="light-swatches" role="group" aria-label="Kleur">
          {SWATCHES.map((swatch) => {
            const selected = mode === 'colour' && sameRgb(swatch.rgb, rgb)
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
              value={toHex(rgb)}
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
