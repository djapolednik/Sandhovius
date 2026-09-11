// A cold-to-hot gradient for displaying a temperature reading. This is a
// fixed data-scale color (like a chart legend), independent of the
// light/dark theme, so it's plain JS rather than a CSS variable — it
// always needs the same blue-to-red mapping regardless of which theme is
// active.
const COLD = [37, 99, 235] // blue-600
const HOT = [220, 38, 38] // red-600
const MIN_C = 0
const MAX_C = 35

export function temperatureColor(celsius) {
  const t = Math.max(0, Math.min(1, (celsius - MIN_C) / (MAX_C - MIN_C)))
  const rgb = COLD.map((c, i) => Math.round(c + (HOT[i] - c) * t))
  return `rgb(${rgb.join(',')})`
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
