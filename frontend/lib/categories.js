// Categorieën op Home (roadmap E1): Licht, Klimaat, Veiligheid en Water, elk
// met de stand in woorden ("2 aan", "20,5°", "1 open", "Droog"). Een knop
// verschijnt alleen als het huis zo'n apparaat heeft. De woorden staan onder
// categories.* in messages/*.json.
import { displayType } from './devices.js'
import { indoorTemperature } from './home.js'
import { formatTemperature } from './temperature.js'

export const CATEGORIES = ['light', 'climate', 'security', 'water']

const has = (device, capability) => (device.capabilities ?? []).includes(capability)
const stateOf = (device) => device.expand?.device_state_via_device?.[0]?.state ?? null

// In welke categorieën een apparaat valt (een sensor kan in meer).
export function categoriesOf(device) {
  const out = []
  if (displayType(device) === 'light') out.push('light')
  if (device.type === 'climate' || (device.type === 'sensor' && has(device, 'temperature'))) out.push('climate')
  if (device.type === 'sensor' && (has(device, 'contact') || has(device, 'smoke'))) out.push('security')
  if (device.type === 'sensor' && has(device, 'water_leak')) out.push('water')
  return out
}

// De stand van een categorie: { state, alert }.
function stateFor({ t, locale }, key, devices) {
  const states = devices.map(stateOf)
  if (key === 'light') {
    const on = states.filter((s) => s?.state === 'on').length
    return { state: on > 0 ? t('categories.lightsOn', { count: on }) : t('categories.allOff'), alert: false }
  }
  if (key === 'climate') {
    const temperature = indoorTemperature(devices.map((d, i) => ({ type: d.type, state: states[i] })))
    return { state: typeof temperature === 'number' ? formatTemperature(temperature, locale) : '', alert: false }
  }
  if (key === 'security') {
    if (states.some((s) => s?.smoke === true)) return { state: t('sensors.smoke'), alert: true }
    // Zigbee2MQTT: contact true = dicht
    const open = devices.filter((d, i) => has(d, 'contact') && states[i]?.contact === false).length
    return { state: open > 0 ? t('categories.open', { count: open }) : t('categories.allClosed'), alert: false }
  }
  const leak = states.some((s) => s?.water_leak === true)
  return { state: leak ? t('sensors.leak') : t('sensors.dry'), alert: leak }
}

// E2: een apparaat kan uit de samenvatting (devices.summary_hidden, bv. de
// schuurlamp). Het telt dan niet mee in Licht en Klimaat, maar blijft in de
// lijst. Veiligheid en Water tellen altijd: een lek verstop je niet.
export const SUMMARY_OPTIONAL = ['light', 'climate']
export const countsInSummary = (device) => !device.summary_hidden

// De knoppen voor Home, in vaste volgorde. known = false (box onbereikbaar):
// wel de knoppen, geen stand.
export function categorySummary(intl, devices, { known = true } = {}) {
  return CATEGORIES.map((key) => {
    const inCategory = devices.filter((device) => categoriesOf(device).includes(key))
    if (inCategory.length === 0) return null
    const counted = SUMMARY_OPTIONAL.includes(key) ? inCategory.filter(countsInSummary) : inCategory
    const { state, alert } = known ? stateFor(intl, key, counted) : { state: '', alert: false }
    return { key, label: intl.t(`categories.${key}`), state, alert, devices: inCategory }
  }).filter(Boolean)
}
