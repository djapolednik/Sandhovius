// Bewegingslicht (spec 2026-10-13-motion-light-design): lampen aan bij
// beweging, uit na een paar minuten zonder. De box beslist; de app bewerkt
// alleen de regels.
import { cachedFormat } from './language.js'

// De keuzes voor "Uit na" in de sheet, in minuten (PocketBase: 1–60).
export const OFF_AFTER_STEPS = [1, 2, 3, 5, 10, 15, 30]

// Beweging in een device-stand, zoals de agent het leest (motionFromState in
// agent/internal/app/motion.go): Zigbee2MQTT meldt occupancy of motion,
// Home Assistant "on" of "off". null = deze stand zegt niets over beweging.
export function motionFromState(state) {
  if (!state) return null
  for (const key of ['occupancy', 'motion']) {
    if (typeof state[key] === 'boolean') return state[key]
  }
  if (state.state === 'on') return true
  if (state.state === 'off') return false
  return null
}

const stateOf = (device) => device.expand?.device_state_via_device?.[0]?.state

// Sensoren die ooit beweging meldden: een temperatuursensor hoort niet in de
// keuze, en een nieuwe sensor verschijnt zodra hij iets meldt. Op naam.
export function motionSensors(devices) {
  return devices
    .filter((device) => device.type === 'sensor' && motionFromState(stateOf(device)) !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Wat een bewegingslicht kan schakelen: lampen en stopcontacten die
// klaargezet zijn (een entity_id hebben).
export function switchableDevices(devices) {
  return devices.filter((device) => ['light', 'switch'].includes(device.type) && device.entity_id)
}

// "Plafondlamp en Nachtlamp, uit na 3 minuten". intl: { t, locale }.
export function describeMotionLight({ t, locale }, rule, deviceNameById = {}) {
  const names = (rule.devices ?? []).map((id) => deviceNameById[id]).filter(Boolean)
  const list = cachedFormat(Intl.ListFormat, locale, { type: 'conjunction' })
  let lamps
  if (names.length === 0) lamps = t('motion.noLamps')
  else if (names.length <= 3) lamps = list.format(names)
  else lamps = list.format([...names.slice(0, 2), t('scenes.andMore', { count: names.length - 2 })])
  return t('motion.summary', { lamps, minutes: rule.off_after })
}

// Apparaten per kamer, in de volgorde die de bewoner koos, en binnen een
// kamer op naam. Zonder kamer (of met een kamer die weg is) achteraan.
export function byRoom(devices, rooms) {
  const rank = new Map([...rooms].sort((a, b) => a.order - b.order).map((room, i) => [room.id, i]))
  const of = (device) => rank.get(device.room) ?? Infinity
  return [...devices].sort((a, b) => of(a) - of(b) || a.name.localeCompare(b.name))
}
