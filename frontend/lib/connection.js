// De agent op de box zet elke 30 s last_seen op het huis-record (zie
// runHeartbeat in de agent). Na drie gemiste slagen noemen we de box
// onbereikbaar: één gemiste slag is nog gewoon een haperend netwerk.
export const HEARTBEAT_STALE_MS = 90 * 1000

// Is de box in huis bereikbaar? Twee signalen, want ze vallen apart uit:
// - house.select: "offline" zet de agent zelf bij een nette stop;
// - last_seen: blijft staan bij stroomuitval of een crash, want dan zegt
//   de agent niets meer.
export function houseConnection(house, nowMs) {
  if (!house) return { reachable: true, since: null }
  const lastSeenMs = house.last_seen ? new Date(house.last_seen).getTime() : null
  const stale = lastSeenMs === null || nowMs - lastSeenMs > HEARTBEAT_STALE_MS
  const reachable = house.select === 'online' && !stale
  return { reachable, since: reachable ? null : lastSeenMs }
}

const TIME_FORMAT = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' })
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

// "14:02" vandaag, "26 sep 14:02" op een andere dag.
export function formatSince(ms, nowMs = Date.now()) {
  const sameDay = new Date(ms).toDateString() === new Date(nowMs).toDateString()
  return (sameDay ? TIME_FORMAT : DATE_TIME_FORMAT).format(ms)
}
