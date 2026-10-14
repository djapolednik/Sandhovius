// Huishouden: rollen, rechten en uitnodigingen. Een huis heeft leden
// (members) en beheerders (admins, altijd ook lid); alleen een beheerder
// nodigt uit, wijzigt rollen, hernoemt het huis en koppelt de box.

import { describeError } from './errors.js'
import { cachedFormat } from './language.js'

export function roleLabel(t, role) {
  return role === 'admin' ? t('household.roles.admin') : t('household.roles.member')
}

export function isAdmin(house, userId) {
  return !!house?.admins?.includes(userId)
}

function endOf(expires) {
  return new Date(String(expires || '').replace(' ', 'T'))
}

// expires is een PocketBase-datum ("2026-10-14 10:00:00.000Z").
export function isExpired(expires, now = new Date()) {
  return !(endOf(expires).getTime() > now.getTime())
}

// Hoe lang een uitnodiging nog geldt, in kalenderdagen (lokale tijd).
export function expiresText(t, expires, now = new Date()) {
  if (isExpired(expires, now)) return t('household.expires.expired')
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(endOf(expires)) - day(now)) / (24 * 60 * 60 * 1000))
  if (days === 0) return t('household.expires.today')
  if (days === 1) return t('household.expires.tomorrow')
  return t('household.expires.inDays', { days })
}

// Het huis dat de app toont: het gekozen huis, anders het eerste. Na weggaan
// of verwijderd worden is het gekozen huis er niet meer; zonder huizen niets.
export function pickHouse(houses, selectedId) {
  return houses.find((h) => h.id === selectedId) ?? houses[0]
}

// De huishouden-endpoints geven een code (errors.codes.<code>) voor wat je
// kunt tonen ("Er moet minstens één beheerder blijven", "Deze uitnodiging is
// verlopen"). Zonder code (een fout van PocketBase zelf, in het Engels) via
// describeError: de message van de server komt nooit op het scherm.
export function householdError(t, what, err) {
  const response = err?.response || {}
  if (response.code && t.has(`errors.codes.${response.code}`)) {
    return t(`errors.codes.${response.code}`, response.params || {})
  }
  if (err?.status === 400 && response.data?.email) return t('errors.invalidEmail')
  return describeError(t, what, err)
}

// Uit een huis gehaald worden zie je niet live: PocketBase stuurt geen events
// naar wie de regel niet meer haalt. Weigert de server iets op huisdata (een
// 4xx, behalve uitgelogd of te veel verzoeken), dan halen we alles opnieuw op
// om te zien of je er nog in zit.
const HOUSE_DATA = /\/api\/(collections\/(houses|devices|device_state|rooms|scenes|schedules|commands|favorites)\/|sandhovius\/houses\/)/

export function isHouseDataRefusal(url, status) {
  if (status < 400 || status >= 500 || status === 401 || status === 429) return false
  return HOUSE_DATA.test(new URL(url, 'http://x').pathname + '/')
}

// Huizen die er na opnieuw ophalen niet meer zijn; die je zelf verliet
// (ignoreIds) tellen niet, die verdwijnen niet onverwacht.
export function lostHouses(before, after, ignoreIds = []) {
  const still = new Set(after.map((h) => h.id))
  return before.filter((h) => !still.has(h.id) && !ignoreIds.includes(h.id))
}

// Gast met een einddatum (D2). until: "JJJJ-MM-DD", de laatste dag.

// Het einde van die dag in de tijdzone van de telefoon, als PocketBase-datum:
// tot en met betekent tot middernacht.
export function guestEnds(until) {
  const [y, m, d] = until.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59).toISOString().replace('T', ' ')
}

// "JJJJ-MM-DD" van een datum, in lokale tijd (voor <input type="date">).
export function dateValue(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// De keuzes in de uitnodiging: vanaf vandaag, hooguit een jaar vooruit.
export function guestRange(now = new Date()) {
  const max = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
  return { min: dateValue(now), max: dateValue(max) }
}

// "Gast tot en met 20 oktober" (dit jaar zonder jaartal). intl: { t, locale }.
export function guestText({ t, locale }, until, now = new Date()) {
  const [y, m, d] = until.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const options = y === now.getFullYear() ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' }
  return t('household.guestUntil', { date: cachedFormat(Intl.DateTimeFormat, locale, options).format(date) })
}
