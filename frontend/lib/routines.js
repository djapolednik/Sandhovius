// Routines (spec 2026-10-14-routines-design.md): als dit gebeurt (starter),
// alleen als (voorwaarden), doe dat (acties), en eventueel daarna uit. De box
// beslist en voert uit; de app bewerkt de routine en zegt hem als één zin,
// dezelfde voor kaart, sheet en schermlezer. intl: { t, locale }.
// names: { devices: { id: naam }, scenes: { id: naam }, users: { id: naam } }.
import { cachedFormat } from './language.js'
import { dayNames, describeDays, scheduleWhen } from './schedules.js'
import { describeLightStep } from './sceneChoices.js'
import { formatTemperature } from './temperature.js'

// De keuzes voor "Daarna uit", in minuten (0 = nooit). Zoals de hook.
export const OFF_AFTER_CHOICES = [0, 1, 5, 15, 30, 60]
export const MAX_ACTIONS = 10
export const STARTER_KINDS = ['time', 'device', 'sensor', 'presence']

// Thuis of weg (spec 2026-10-14-presence-design.md): voor het hele huis, of
// per lid (dan met user). In de volgorde van de sheet.
export const PRESENCE_EVENTS = ['all_away', 'first_home', 'arrives', 'leaves']
export const PRESENCE_STATES = ['someone_home', 'nobody_home', 'home', 'away']
const PER_PERSON = ['arrives', 'leaves', 'home', 'away']
export const needsPerson = (value) => PER_PERSON.includes(value)

// Welke mogelijkheid een sensor nodig heeft voor een gebeurtenis, in de
// volgorde van de sheet. Zoals SENSOR_EVENTS in pb_hooks/automation_rules.js.
export const SENSOR_EVENTS = {
  motion: 'occupancy',
  no_motion: 'occupancy',
  open: 'contact',
  closed: 'contact',
  leak: 'water_leak',
  smoke: 'smoke',
  above: 'temperature',
  below: 'temperature',
}

const capsOf = (device) => (Array.isArray(device?.capabilities) ? device.capabilities : [])

// Wat deze sensor kan melden.
export function sensorEvents(device) {
  return Object.keys(SENSOR_EVENTS).filter((event) => capsOf(device).includes(SENSOR_EVENTS[event]))
}

// Sensoren die een routine kunnen starten, op naam.
export function routineSensors(devices) {
  return devices
    .filter((device) => device.type === 'sensor' && sensorEvents(device).length > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
}

const capitalize = (text, locale) => text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
const list = (locale) => cachedFormat(Intl.ListFormat, locale, { type: 'conjunction' })

function deviceName({ t }, names, id) {
  return names?.devices?.[id] ?? t('routines.unknownDevice')
}

function userName({ t }, names, id) {
  return names?.users?.[id] ?? t('routines.unknownPerson')
}

// "Als Voordeur opengaat", "Elke dag om 07:00", "Werkdagen bij zonsondergang".
// Leeg als de starter nog niet af is.
export function describeStarter(intl, starter, names) {
  const { t, locale } = intl
  if (!starter || missingStarter(starter)) return ''
  if (starter.kind === 'time') return t('schedules.daysAt', { days: describeDays(intl, starter.days), time: starter.time })
  if (starter.kind === 'sun') {
    const when = scheduleWhen(intl, { trigger: starter.event, offset_min: starter.offset_min ?? 0 })
    return t('schedules.daysWhen', { days: describeDays(intl, starter.days), when })
  }
  if (starter.kind === 'presence') {
    return t(`routines.starter.presence.${starter.event}`, { name: needsPerson(starter.event) ? userName(intl, names, starter.user) : '' })
  }
  const name = deviceName(intl, names, starter.device)
  if (starter.kind === 'device') return t(`routines.starter.device.${starter.to}`, { name })
  const value = typeof starter.value === 'number' ? formatTemperature(starter.value, locale) : ''
  return t(`routines.starter.sensor.${starter.event}`, { name, value })
}

function describeCondition(intl, condition, names) {
  const { t, locale } = intl
  if (condition.kind === 'dark') return t('routines.condition.dark')
  if (condition.kind === 'presence') {
    return t(`routines.condition.presence.${condition.state}`, {
      name: needsPerson(condition.state) ? userName(intl, names, condition.user) : '',
    })
  }
  if (condition.kind === 'between') return t('routines.condition.between', { from: condition.from, to: condition.to })
  const keys = dayNames(locale).filter((day) => condition.days.includes(day.key))
  const joined = keys.map((day) => day.key).join(' ')
  if (joined === 'mon tue wed thu fri') return t('routines.condition.weekdays')
  if (joined === 'sat sun') return t('routines.condition.weekend')
  return t('routines.condition.days', { days: list(locale).format(keys.map((day) => day.long)) })
}

// "alleen als het donker is en tussen 22:00 en 06:00". Leeg zonder.
export function describeConditions(intl, conditions, names) {
  const parts = (conditions ?? []).filter((c) => !missingCondition(c)).map((c) => describeCondition(intl, c, names))
  if (parts.length === 0) return ''
  return intl.t('routines.condition.only', { conditions: list(intl.locale).format(parts) })
}

function describeAction(intl, action, names) {
  const { t, locale } = intl
  if (action.kind === 'notify') {
    const users = action.users ?? []
    const to = users.length === 0 ? t('routines.everyone') : list(locale).format(users.map((u) => userName(intl, names, u)))
    return t('routines.action.notify', { text: action.text.trim(), to })
  }
  if (action.kind === 'scene') return t('routines.action.scene', { name: names?.scenes?.[action.scene] ?? t('routines.unknownScene') })
  const name = deviceName(intl, names, action.device)
  if (action.action === 'turn_off') return t('routines.action.off', { name })
  const detail = describeLightStep(t, action.payload)
  return detail ? t('routines.action.onDetail', { name, detail }) : t('routines.action.on', { name })
}

// "Ganglamp aan en Keukenlamp uit, na 5 minuten weer uit".
export function describeDoes(intl, routine, names) {
  const { t, locale } = intl
  const parts = (routine.actions ?? []).filter((a) => !missingAction(a)).map((a) => describeAction(intl, a, names))
  let does
  if (parts.length === 0) does = t('routines.nothingYet')
  else if (parts.length <= 3) does = list(locale).format(parts)
  else does = list(locale).format([...parts.slice(0, 2), t('scenes.andMore', { count: parts.length - 2 })])
  if (!routine.off_after) return does
  return t('routines.offAfterPart', { does, minutes: routine.off_after })
}

// De hele routine als zin: "Als Voordeur opengaat, alleen als het donker is:
// Ganglamp aan, na 5 minuten weer uit."
export function describeAutomation(intl, routine, names) {
  const { t, locale } = intl
  const starter = describeStarter(intl, routine.starter, names) || t('routines.starterYet')
  const conditions = describeConditions(intl, routine.conditions, names)
  const sentence = t('routines.sentence', {
    starter: conditions ? `${starter}, ${conditions}` : starter,
    does: describeDoes(intl, routine, names),
  })
  return capitalize(sentence, locale)
}

// Wat de kaart als titel toont: de eigen naam, of anders de starter.
export function routineTitle(intl, routine, names) {
  return routine.name?.trim() || describeStarter(intl, routine.starter, names) || intl.t('routines.untitled')
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const hasDays = (days) => Array.isArray(days) && days.length > 0

function missingStarter(s) {
  if (!s || !s.kind) return 'starter'
  if (s.kind === 'time') return !TIME.test(s.time ?? '') ? 'time' : hasDays(s.days) ? null : 'days'
  if (s.kind === 'sun') return hasDays(s.days) ? null : 'days'
  if (s.kind === 'device') return s.device ? (s.to ? null : 'to') : 'lamp'
  if (s.kind === 'presence') {
    if (!PRESENCE_EVENTS.includes(s.event)) return 'presence'
    return needsPerson(s.event) && !s.user ? 'person' : null
  }
  if (s.kind === 'sensor') {
    if (!s.device) return 'sensor'
    if (!SENSOR_EVENTS[s.event]) return 'event'
    if ((s.event === 'above' || s.event === 'below') && !(typeof s.value === 'number' && s.value >= 0 && s.value <= 40)) {
      return 'temperature'
    }
    return null
  }
  return 'starter'
}

function missingCondition(c) {
  if (c.kind === 'dark') return null
  if (c.kind === 'between') return TIME.test(c.from ?? '') && TIME.test(c.to ?? '') && c.from !== c.to ? null : 'between'
  if (c.kind === 'days') return hasDays(c.days) ? null : 'days'
  if (c.kind === 'presence') {
    if (!PRESENCE_STATES.includes(c.state)) return 'condition'
    return needsPerson(c.state) && !c.user ? 'person' : null
  }
  return 'condition'
}

const notifyText = (a) => (a.text ?? '').trim()

function missingAction(a, known) {
  if (a.kind === 'notify') return notifyText(a) && notifyText(a).length <= 80 ? null : 'text'
  if (a.kind === 'scene') return a.scene && (!known || known.scenes.has(a.scene)) ? null : 'target'
  return a.device && (!known || known.devices.has(a.device)) && a.action ? null : 'target'
}

// Wat er nog mist, als sleutel onder routines.missing (en het deel van de
// routine, voor de hook-foutcode params.part), of null als hij af is. known:
// { devices: Set, scenes: Set } van wat er in het huis nog is.
export function missingStep(routine, known) {
  const starter = missingStarter(routine.starter)
  if (starter) return { part: 'starter', key: `routines.missing.${starter}` }
  for (const c of routine.conditions ?? []) {
    const missing = missingCondition(c)
    if (missing) return { part: 'conditions', key: `routines.missing.${missing}` }
  }
  const actions = routine.actions ?? []
  if (actions.length === 0) return { part: 'actions', key: 'routines.missing.action' }
  if (actions.some((a) => missingAction(a, known) === 'text')) return { part: 'actions', key: 'routines.missing.text' }
  if (actions.some((a) => missingAction(a, known))) return { part: 'actions', key: 'routines.missing.target' }
  return null
}

// Alleen de velden die bij de soort horen, zoals de hook ze wil: de sheet
// onthoudt wat je bij een andere soort koos, PocketBase krijgt dat niet.
export function routineRecord(draft) {
  const s = draft.starter
  const starters = {
    time: () => ({ kind: 'time', time: s.time, days: s.days }),
    sun: () => ({ kind: 'sun', event: s.event, offset_min: s.offset_min ?? 0, days: s.days }),
    device: () => ({ kind: 'device', device: s.device, to: s.to }),
    presence: () => (needsPerson(s.event) ? { kind: 'presence', event: s.event, user: s.user } : { kind: 'presence', event: s.event }),
    sensor: () => {
      const out = { kind: 'sensor', device: s.device, event: s.event }
      if (s.event === 'above' || s.event === 'below') out.value = s.value
      return out
    },
  }
  const conditions = (draft.conditions ?? []).map((c) => {
    if (c.kind === 'between') return { kind: 'between', from: c.from, to: c.to }
    if (c.kind === 'days') return { kind: 'days', days: c.days }
    if (c.kind === 'presence') {
      return needsPerson(c.state) ? { kind: 'presence', state: c.state, user: c.user } : { kind: 'presence', state: c.state }
    }
    return { kind: c.kind }
  })
  const actions = (draft.actions ?? []).map((a) => {
    if (a.kind === 'scene') return { kind: 'scene', scene: a.scene }
    if (a.kind === 'notify') {
      const users = a.users ?? []
      return users.length > 0 ? { kind: 'notify', text: notifyText(a), users } : { kind: 'notify', text: notifyText(a) }
    }
    const out = { kind: 'device', device: a.device, action: a.action }
    if (a.action === 'turn_on' && a.payload && Object.keys(a.payload).length > 0) out.payload = a.payload
    return out
  })
  return {
    name: (draft.name ?? '').trim(),
    starter: starters[s.kind](),
    conditions,
    actions,
    off_after: draft.off_after ?? 0,
  }
}
