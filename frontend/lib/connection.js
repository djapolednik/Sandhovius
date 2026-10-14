import { cachedFormat } from './language.js'

// De agent op de box zet elke 30 s last_seen op het huis-record (zie
// runHeartbeat in de agent). Na drie gemiste slagen noemen we de box
// onbereikbaar: één gemiste slag is nog gewoon een haperend netwerk.
const HEARTBEAT_STALE_MS = 90 * 1000

// Is de box in huis bereikbaar? Twee signalen, want ze vallen apart uit:
// - house.select: "offline" zet de agent zelf bij een nette stop;
// - last_seen: blijft staan bij stroomuitval of een crash, want dan zegt
//   de agent niets meer.
// Zonder gekoppelde box (claimed_at leeg, bv. na "Box ontkoppelen") is er
// niets om te bereiken: dat is geen storing, en zo zeggen we het ook
// (linked: false).
export function houseConnection(house, nowMs) {
  if (!house) return { reachable: true, linked: true, since: null }
  if (!house.claimed_at) return { reachable: false, linked: false, since: null }
  const lastSeenMs = house.last_seen ? new Date(house.last_seen).getTime() : null
  const stale = lastSeenMs === null || nowMs - lastSeenMs > HEARTBEAT_STALE_MS
  const reachable = house.select === 'online' && !stale
  return { reachable, linked: true, since: reachable ? null : lastSeenMs }
}

const TIME = { hour: '2-digit', minute: '2-digit' }
const DATE_TIME = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }

// "14:02" vandaag, "26 sep 14:02" (of "26 Sept, 14:02") op een andere dag.
export function formatSince(ms, nowMs, locale) {
  const sameDay = new Date(ms).toDateString() === new Date(nowMs).toDateString()
  return cachedFormat(Intl.DateTimeFormat, locale, sameDay ? TIME : DATE_TIME).format(ms)
}

// "Software bijgewerkt op 14 oktober" (K1): wanneer de box voor het laatst een
// andere versie meldde (houses.box_version_since). Leeg zonder datum; het
// jaartal alleen als het niet dit jaar was. intl: { t, locale }.
export function softwareText({ t, locale }, since, nowMs) {
  if (!since) return ''
  const at = new Date(String(since).replace(' ', 'T'))
  if (Number.isNaN(at.getTime())) return ''
  const sameYear = at.getFullYear() === new Date(nowMs).getFullYear()
  const options = sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' }
  return t('connection.software', { date: cachedFormat(Intl.DateTimeFormat, locale, options).format(at) })
}
