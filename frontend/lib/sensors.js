// Sensoren: de stand die het zwaarst weegt is de lezing op de tegel, in
// woorden (The State Means State Rule: kleur alleen samen met tekst). De
// stand komt van Zigbee2MQTT; let op: contact true betekent dicht.
import { formatTemperature } from './temperature.js'

export const READING_ORDER = ['smoke', 'water_leak', 'contact', 'occupancy', 'temperature', 'humidity', 'illuminance']

// Waar een mogelijkheid in de stand staat (oudere apparaten gebruiken soms
// een andere naam).
const FIELDS = {
  occupancy: ['occupancy', 'motion'],
  illuminance: ['illuminance', 'illuminance_lux'],
}

function valueOf(state, capability) {
  for (const field of FIELDS[capability] ?? [capability]) {
    if (state[field] != null) return state[field]
  }
  return null
}

// De lezing voor de tegel: { capability, value } of null. De batterij is
// nooit de lezing; die staat in de detail-sheet en in Let op.
export function primaryReading(capabilities, state) {
  if (!Array.isArray(capabilities) || !state) return null
  for (const capability of READING_ORDER) {
    if (!capabilities.includes(capability)) continue
    const value = valueOf(state, capability)
    if (value != null) return { capability, value }
  }
  return null
}

// Alles wat de sensor meet, voor de detail-sheet: in de volgorde van de
// tegel, zonder batterij (die heeft een eigen regel). Zonder mogelijkheden
// alles wat in de stand staat.
export function allReadings(capabilities, state) {
  if (!state) return []
  const caps = Array.isArray(capabilities) ? capabilities : READING_ORDER
  return READING_ORDER.filter((capability) => caps.includes(capability))
    .map((capability) => ({ capability, value: valueOf(state, capability) }))
    .filter((reading) => reading.value != null)
}

const WORDS = {
  contact: ['sensors.closed', 'sensors.open'],
  water_leak: ['sensors.leak', 'sensors.dry'],
  smoke: ['sensors.smoke', 'sensors.noSmoke'],
  occupancy: ['device.motion', 'device.noMotion'],
}

export function readingText({ t, locale }, { capability, value }) {
  if (WORDS[capability]) return t(WORDS[capability][value ? 0 : 1])
  if (capability === 'temperature') return formatTemperature(value, locale)
  if (capability === 'humidity') return t('sensors.humidity', { value: Math.round(value) })
  if (capability === 'illuminance') return t('sensors.illuminance', { value: Math.round(value) })
  return String(value)
}

// Rook of lekkage: bovenaan Let op. Alleen als het apparaat dat ook kan.
export function alarmKind(device, state) {
  const caps = device?.capabilities ?? []
  if (!state) return null
  if (caps.includes('smoke') && state.smoke === true) return 'smoke'
  if (caps.includes('water_leak') && state.water_leak === true) return 'leak'
  return null
}
