// Klimaatstanden (roadmap F2): Comfort, Eco en Slaap als temperaturen van het
// huis (houses.climate_*). De radiatorknop kent ze zelf niet; de app en de box
// sturen ze als setpoint. 0 op het huis = de standaard, dezelfde als in de
// agent (presetTemperature in routine_runner.go).
import { formatTemperature } from './temperature.js'

export const PRESETS = ['comfort', 'eco', 'sleep']
export const PRESET_DEFAULTS = { comfort: 20, eco: 17, sleep: 16 }
export const PRESET_MIN = 5
export const PRESET_MAX = 30

// { comfort, eco, sleep } in graden voor dit huis.
export function presetTemps(house) {
  return Object.fromEntries(PRESETS.map((p) => [p, house?.[`climate_${p}`] || PRESET_DEFAULTS[p]]))
}

// Welke stand bij dit doel hoort (de eerste die past), of null.
export function presetAt(target, temps) {
  if (typeof target !== 'number') return null
  return PRESETS.find((p) => temps[p] === target) ?? null
}

// "2° lager dan Comfort", "Even warm als Comfort"; leeg voor Comfort zelf.
// intl: { t, locale }.
export function compareText({ t, locale }, preset, temps) {
  if (preset === 'comfort') return ''
  const diff = temps.comfort - temps[preset]
  const comfort = t('climate.presets.comfort')
  if (diff === 0) return t('climate.presetSame', { comfort })
  const degrees = formatTemperature(Math.abs(diff), locale)
  return t(diff > 0 ? 'climate.presetLower' : 'climate.presetHigher', { degrees, comfort })
}
