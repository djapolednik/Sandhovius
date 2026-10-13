// Het weer bij het huis (houses.weather, gezet door de agent uit Home
// Assistant / Met.no). Bijzaak op Home: een rustige regel op de telefoon,
// een kaart op een breed scherm. Nooit live-informatie uit het huis, dus
// het gloeit niet en het zegt altijd hoe oud het is.

// Zo lang na het ophalen noemen we het weer verouderd. De agent haalt elk
// half uur op; na vier gemiste keren heeft de box vrijwel zeker geen
// internet (Met.no is een internetdienst).
export const WEATHER_STALE_MS = 2 * 60 * 60 * 1000

import { cachedFormat } from './language.js'

// De standen van een HA weather-entiteit, met hun icoon (de sleutel in
// WeatherIcon, lib/icons.js). De woorden staan in messages/*.json onder
// weather.conditions.<stand>.
const ICONS = {
  'clear-night': 'moon',
  sunny: 'sun',
  partlycloudy: 'partly',
  cloudy: 'cloud',
  fog: 'fog',
  rainy: 'rain',
  pouring: 'rain',
  'lightning-rainy': 'storm',
  lightning: 'storm',
  hail: 'snow',
  snowy: 'snow',
  'snowy-rainy': 'snow',
  windy: 'wind',
  'windy-variant': 'wind',
  exceptional: 'cloud',
}

// { key, icon }: key is de sleutel van de woorden ("Half bewolkt").
export function describeCondition(condition) {
  if (!ICONS[condition]) return { key: 'weather.conditions.unknown', icon: 'cloud' }
  return { key: `weather.conditions.${condition}`, icon: ICONS[condition] }
}

// Weer in hele graden: een voorspelling is geen meting, 25,6° suggereert
// een precisie die er niet is. (Sensoren houden hun ene decimaal.)
export function formatDegrees(celsius) {
  return `${Math.round(celsius)}°`
}

export function isWeatherStale(updated, now) {
  if (!updated) return true
  return now - new Date(updated).getTime() > WEATHER_STALE_MS
}

// De uren vanaf het lopende uur. Als het weer oud is vallen voorbije uren
// weg, zodat de strook nooit het verleden als voorspelling toont.
export function upcomingHours(weather, now, count = 12) {
  const currentHour = new Date(now)
  currentHour.setMinutes(0, 0, 0)
  return (weather?.hours ?? []).filter((hour) => new Date(hour.time) >= currentHour).slice(0, count)
}

function localDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// Dagen vanaf vandaag (lokale tijd).
export function upcomingDays(weather, now, count = 5) {
  const today = localDay(now)
  return (weather?.days ?? []).filter((day) => localDay(day.date) >= today).slice(0, count)
}

// "Vandaag", "Morgen", daarna de weekdag ("Zaterdag"). intl: { t, locale }
// (useIntl in app/LanguageContext.js).
export function dayLabel({ t, locale }, date, now) {
  const diff = Math.round((localDay(date) - localDay(now)) / 86400000)
  if (diff === 0) return t('weather.today')
  if (diff === 1) return t('weather.tomorrow')
  const name = cachedFormat(Intl.DateTimeFormat, locale, { weekday: 'long' }).format(new Date(date))
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
}

// "14:00", in beide talen met een 24-uursklok (en-GB).
export function formatHour(time, locale) {
  return cachedFormat(Intl.DateTimeFormat, locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(time))
}
