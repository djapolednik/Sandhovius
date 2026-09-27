// A cold-to-hot color for displaying a temperature reading. The position
// on the scale is computed here; the two endpoint colors are theme tokens
// (--temp-cold / --temp-hot in theme.css), because the reading is text and
// has to stay legible on both the light and the dark card. A fixed RGB
// scale was ~2.5:1 on the dark card. Mixing in OKLab keeps the midpoints
// as light as the endpoints instead of dipping into a muddy purple.
const MIN_C = 0
const MAX_C = 35

export function temperatureColor(celsius) {
  const t = Math.max(0, Math.min(1, (celsius - MIN_C) / (MAX_C - MIN_C)))
  const hotPercent = Math.round(t * 100)
  return `color-mix(in oklab, var(--temp-hot) ${hotPercent}%, var(--temp-cold))`
}

// "21,5°" — Nederlandse decimale komma en altijd één decimaal, zodat een
// stap van 21,0 naar 21,5 niet van breedte verspringt.
const TEMPERATURE_FORMAT = new Intl.NumberFormat('nl-NL', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export function formatTemperature(celsius) {
  return `${TEMPERATURE_FORMAT.format(celsius)}°`
}

// Leest een temperatuurwaarde uit een device_state.state blob, ongeacht de
// bron:
// - Zigbee2MQTT-apparaten leggen het plat neer (state.temperature of
//   state.local_temperature, als getal).
// - Home Assistant-entiteiten (bv. een input_number "sensor") rapporteren
//   hun waarde als state.state (een string!) met de eenheid in
//   state.attributes.unit_of_measurement — alleen als die eenheid een
//   temperatuur is nemen we 'm over, anders zou elke numerieke HA-sensor
//   (percentage, lux, ...) hier ten onrechte als temperatuur verschijnen.
export function readTemperature(state) {
  const flat = state?.temperature ?? state?.local_temperature
  if (typeof flat === 'number') return flat

  const unit = state?.attributes?.unit_of_measurement
  if (typeof unit === 'string' && unit.includes('°')) {
    const parsed = parseFloat(state?.state)
    if (!Number.isNaN(parsed)) return parsed
  }

  return undefined
}
