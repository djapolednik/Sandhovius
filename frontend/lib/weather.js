// Het weer bij het huis (houses.weather, gezet door de agent uit Home
// Assistant / Met.no). Bijzaak op Home: een rustige regel op de telefoon,
// een kaart op een breed scherm. Nooit live-informatie uit het huis, dus
// het gloeit niet en het zegt altijd hoe oud het is.

// Zo lang na het ophalen noemen we het weer verouderd. De agent haalt elk
// half uur op; na vier gemiste keren heeft de box vrijwel zeker geen
// internet (Met.no is een internetdienst).
export const WEATHER_STALE_MS = 2 * 60 * 60 * 1000

// De standen van een HA weather-entiteit, in gewone woorden. icon is de
// sleutel in WeatherIcon (lib/icons.js).
const CONDITIONS = {
  'clear-night': { label: 'Helder', icon: 'moon' },
  sunny: { label: 'Zonnig', icon: 'sun' },
  partlycloudy: { label: 'Half bewolkt', icon: 'partly' },
  cloudy: { label: 'Bewolkt', icon: 'cloud' },
  fog: { label: 'Mist', icon: 'fog' },
  rainy: { label: 'Regen', icon: 'rain' },
  pouring: { label: 'Zware regen', icon: 'rain' },
  'lightning-rainy': { label: 'Onweer en regen', icon: 'storm' },
  lightning: { label: 'Onweer', icon: 'storm' },
  hail: { label: 'Hagel', icon: 'snow' },
  snowy: { label: 'Sneeuw', icon: 'snow' },
  'snowy-rainy': { label: 'Natte sneeuw', icon: 'snow' },
  windy: { label: 'Winderig', icon: 'wind' },
  'windy-variant': { label: 'Winderig en bewolkt', icon: 'wind' },
  exceptional: { label: 'Uitzonderlijk weer', icon: 'cloud' },
}

export function describeCondition(condition) {
  return CONDITIONS[condition] ?? { label: 'Onbekend', icon: 'cloud' }
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

const WEEKDAY = new Intl.DateTimeFormat('nl-NL', { weekday: 'long' })
const HOUR = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' })

// "Vandaag", "Morgen", daarna de weekdag ("Zaterdag").
export function dayLabel(date, now) {
  const diff = Math.round((localDay(date) - localDay(now)) / 86400000)
  if (diff === 0) return 'Vandaag'
  if (diff === 1) return 'Morgen'
  const name = WEEKDAY.format(new Date(date))
  return name.charAt(0).toUpperCase() + name.slice(1)
}

export function formatHour(time) {
  return HOUR.format(new Date(time))
}
