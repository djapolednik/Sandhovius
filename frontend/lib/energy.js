// Energie (roadmap C2): de box schrijft de meting van een stekker in
// device_state.metering: { power (W), energy_today (kWh), day }. Hier wat de
// app ervan toont. intl: { t, locale }.
import { cachedFormat } from './language.js'

const pad = (n) => String(n).padStart(2, '0')
const today = (now) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

// { power, energyToday } of null. Een verbruik van een andere dag telt niet:
// dan meldde de stekker vandaag nog niets.
export function meteringOf(device, now = new Date()) {
  const m = device?.expand?.device_state_via_device?.[0]?.metering
  if (!m || typeof m !== 'object') return null
  const power = typeof m.power === 'number' ? m.power : null
  const energyToday = typeof m.energy_today === 'number' && m.day === today(now) ? m.energy_today : null
  if (power === null && energyToday === null) return null
  return { power, energyToday }
}

export function powerText({ t, locale }, watts) {
  return t('energy.watts', { value: cachedFormat(Intl.NumberFormat, locale, { maximumFractionDigits: 0 }).format(watts) })
}

export function energyText({ t, locale }, kwh) {
  return t('energy.kwh', { value: cachedFormat(Intl.NumberFormat, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(kwh) })
}
