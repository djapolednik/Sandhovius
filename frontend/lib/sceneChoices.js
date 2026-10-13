// Wat een scène per apparaat doet: niets, aan, uit of (bij een lamp die kan
// dimmen of kleuren) "zoals nu": aan met de huidige helderheid en kleur.
// Een thermostaat die "aan" gaat, gaat meteen naar een temperatuur
// (turn_on + set_temperature).
import { capabilities, payloadFor, percentFromBrightness } from './light.js'

const DEFAULT_TEMPERATURE = 20
const COLOUR_MODES = ['hs', 'rgb', 'xy', 'rgbw', 'rgbww']
const WARM_MAX_KELVIN = 4000

export function currentTarget(device) {
  const state = device.expand?.device_state_via_device?.[0]?.state
  const target = state?.occupied_heating_setpoint ?? state?.attributes?.temperature
  return typeof target === 'number' ? target : DEFAULT_TEMPERATURE
}

export function choicesFromActions(actions, devices) {
  const choices = {}
  for (const device of devices) choices[device.id] = { mode: 'skip', temperature: currentTarget(device) }
  for (const step of actions ?? []) {
    const choice = choices[step.device]
    if (!choice) continue
    if (step.action === 'turn_off') choice.mode = 'off'
    if (step.action === 'turn_on') {
      const hasPayload = step.payload && Object.keys(step.payload).length > 0
      choice.mode = hasPayload ? 'current' : 'on'
      if (hasPayload) choice.payload = step.payload
    }
    if (step.action === 'set_temperature') {
      choice.mode = 'on'
      choice.temperature = step.payload?.temperature ?? choice.temperature
    }
  }
  return choices
}

export function actionsFromChoices(choices, devices) {
  const actions = []
  for (const device of devices) {
    const choice = choices[device.id]
    if (!choice || choice.mode === 'skip') continue
    if (choice.mode === 'off') actions.push({ device: device.id, action: 'turn_off' })
    else if (choice.mode === 'current') {
      const step = { device: device.id, action: 'turn_on' }
      if (choice.payload) step.payload = choice.payload
      actions.push(step)
    } else {
      actions.push({ device: device.id, action: 'turn_on' })
      if (device.type === 'climate') {
        actions.push({ device: device.id, action: 'set_temperature', payload: { temperature: choice.temperature } })
      }
    }
  }
  return actions
}

// De huidige stand van een lamp als turn_on-payload, of null als de lamp uit
// staat, niet beschikbaar is of niet kan dimmen of kleuren.
export function currentPayload(device) {
  const state = device?.expand?.device_state_via_device?.[0]?.state
  if (state?.state !== 'on') return null
  const attrs = state.attributes
  const caps = capabilities(attrs)
  if (!caps.dim && !caps.colour) return null
  const mode = attrs?.color_mode
  const payload = payloadFor({
    brightnessPct: caps.dim ? percentFromBrightness(attrs?.brightness) : null,
    kelvin: mode === 'color_temp' ? attrs?.color_temp_kelvin : null,
    rgb: COLOUR_MODES.includes(mode) ? attrs?.rgb_color : null,
  })
  return Object.keys(payload).length > 0 ? payload : null
}

// "40%, warm wit", "40%, kleur": korte tekst bij een opgeslagen lampstand.
export function describeLightStep(t, payload) {
  const parts = []
  if (Number.isFinite(payload?.brightness_pct)) parts.push(`${payload.brightness_pct}%`)
  if (Number.isFinite(payload?.color_temp_kelvin)) {
    parts.push(payload.color_temp_kelvin <= WARM_MAX_KELVIN ? t('light.warmWhite') : t('light.coolWhite'))
  } else if (Array.isArray(payload?.rgb_color)) parts.push(t('light.colour'))
  return parts.join(', ')
}
