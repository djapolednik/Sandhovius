// Huishouden: rollen, rechten en uitnodigingen. Een huis heeft leden
// (members) en beheerders (admins, altijd ook lid); alleen een beheerder
// nodigt uit, wijzigt rollen, hernoemt het huis en koppelt de box.

import { describeError } from './errors.js'

export function roleLabel(role) {
  return role === 'admin' ? 'Beheerder' : 'Huisgenoot'
}

export function isAdmin(house, userId) {
  return !!house?.admins?.includes(userId)
}

// Hoe lang een uitnodiging nog geldt, in kalenderdagen (lokale tijd).
// expires is een PocketBase-datum ("2026-10-14 10:00:00.000Z").
export function expiresText(expires, now = new Date()) {
  const end = new Date(String(expires || '').replace(' ', 'T'))
  if (!(end.getTime() > now.getTime())) return 'verlopen'
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(end) - day(now)) / (24 * 60 * 60 * 1000))
  if (days === 0) return 'verloopt vandaag'
  if (days === 1) return 'verloopt morgen'
  return `verloopt over ${days} dagen`
}

// Het huis dat de app toont: het gekozen huis, anders het eerste. Na weggaan
// of verwijderd worden is het gekozen huis er niet meer; zonder huizen niets.
export function pickHouse(houses, selectedId) {
  return houses.find((h) => h.id === selectedId) ?? houses[0]
}

// De huishouden-endpoints geven zelf een Nederlandse melding die je kunt
// tonen ("Er moet minstens één beheerder blijven", "Deze uitnodiging is
// verlopen"). Andere fouten gaan via describeError, zodat er nooit Engelse
// PocketBase-tekst op het scherm komt.
// Een 403 of 400 kan ook van PocketBase zelf komen (Engels): die alleen
// bij onze eigen tekst.
const SHOWN_STATUSES = [409, 410]

export function householdError(what, err) {
  const status = err?.status
  const message = err?.response?.message || ''
  if (SHOWN_STATUSES.includes(status) && message) return message
  if (status === 403 && message.startsWith('Bevestig')) return message
  if (status === 400 && message.startsWith('Al lid')) return message
  if (status === 400 && err?.response?.data?.email) return 'Vul een geldig e-mailadres in.'
  return describeError(what, err)
}
