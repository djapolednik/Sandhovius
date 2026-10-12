// Rekenwerk voor lampen: wat een lamp kan, hoe fel hij brandt en in welke
// kleur de tegel gloeit. Alles werkt op de HA-attributen van een light.*
// en is veilig voor ontbrekende of kapotte waarden (unavailable, geen
// attributen): dan kan de lamp niets en gloeit de tegel standaard.

const COLOUR_MODES = ['hs', 'rgb', 'xy', 'rgbw', 'rgbww']

// De icooncirkel (--surface-2 in theme.css), per thema.
const CIRCLE = { light: [243, 243, 244], dark: [34, 37, 42] }

const WARM = [255, 176, 32] // --lamp-glow, 2200K
const WHITE = [255, 255, 255] // 6500K
const WARM_K = 2200
const WHITE_K = 6500

// Hoeveel een RGB-kleur naar wit gaat: een volle rgb(255,0,0) als gloed
// achter een tegel is anders schreeuwerig.
const DESATURATE = 0.15
// Een lamp op 1% blijft zichtbaar branden; op 100% gelijk aan de gewone gloed.
const MIN_STRENGTH = 0.25
const MIN_CONTRAST = 3

const isRgb = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n))
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const rgbString = ([r, g, b]) => `rgb(${r}, ${g}, ${b})`

export function capabilities(attributes) {
  const modes = Array.isArray(attributes?.supported_color_modes) ? attributes.supported_color_modes : []
  const white = modes.includes('color_temp')
  const colour = modes.some((m) => COLOUR_MODES.includes(m))
  const dim = modes.some((m) => m !== 'onoff' && m !== 'unknown')
  const min = attributes?.min_color_temp_kelvin
  const max = attributes?.max_color_temp_kelvin
  return {
    dim,
    white,
    colour,
    minKelvin: white && Number.isFinite(min) ? min : null,
    maxKelvin: white && Number.isFinite(max) ? max : null,
  }
}

export function percentFromBrightness(brightness) {
  if (!Number.isFinite(brightness)) return null
  return clamp(Math.round((brightness / 255) * 100), 1, 100)
}

// Lineair tussen het amber van de tegel (2200K) en wit (6500K).
export function kelvinToRgb(kelvin) {
  const t = clamp((kelvin - WARM_K) / (WHITE_K - WARM_K), 0, 1)
  return WARM.map((w, i) => Math.round(w + (WHITE[i] - w) * t))
}

export function glowFor(attributes) {
  const brightness = attributes?.brightness
  const strength = Number.isFinite(brightness)
    ? MIN_STRENGTH + (1 - MIN_STRENGTH) * clamp(brightness / 255, 0, 1)
    : 1
  const mode = attributes?.color_mode
  let rgb = null
  if (mode === 'color_temp' && Number.isFinite(attributes?.color_temp_kelvin)) {
    rgb = kelvinToRgb(attributes.color_temp_kelvin)
  } else if (COLOUR_MODES.includes(mode) && isRgb(attributes?.rgb_color)) {
    rgb = attributes.rgb_color.map((c) => Math.round(clamp(c, 0, 255) + (255 - clamp(c, 0, 255)) * DESATURATE))
  }
  // rgb als getallen voor iconColorFor, color als CSS-waarde voor de tegel.
  return { color: rgb && rgbString(rgb), rgb, strength }
}

function luminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// De kleur voor het icoon, of null als die te weinig afsteekt van de cirkel
// (dan valt de tegel terug op het amber van lamp-icon).
export function iconColorFor(rgb, theme) {
  if (!isRgb(rgb)) return null
  const circle = CIRCLE[theme] ?? CIRCLE.light
  return contrast(rgb, circle) >= MIN_CONTRAST ? rgbString(rgb) : null
}

export function lightStateText(state) {
  if (state?.state !== 'on') return 'Uit'
  const caps = capabilities(state.attributes)
  const percent = caps.dim ? percentFromBrightness(state.attributes?.brightness) : null
  return percent === null ? 'Aan' : `Aan · ${percent}%`
}

// Het turn_on-payload voor een schuif of staal: alleen de sleutels die
// gezet zijn, afgerond en binnen wat de agent accepteert. Kelvin en rgb gaan
// nooit samen mee: `last` zegt welke de laatst gekozen is (anders rgb).
export function payloadFor({ brightnessPct, kelvin, rgb, last } = {}) {
  const payload = {}
  if (Number.isFinite(brightnessPct)) payload.brightness_pct = clamp(Math.round(brightnessPct), 1, 100)
  const hasKelvin = Number.isFinite(kelvin)
  const hasRgb = isRgb(rgb)
  if (hasKelvin && hasRgb) {
    if (last === 'kelvin') payload.color_temp_kelvin = clamp(Math.round(kelvin), 1500, 9000)
    else payload.rgb_color = rgb.map((c) => clamp(Math.round(c), 0, 255))
  } else if (hasKelvin) {
    payload.color_temp_kelvin = clamp(Math.round(kelvin), 1500, 9000)
  } else if (hasRgb) {
    payload.rgb_color = rgb.map((c) => clamp(Math.round(c), 0, 255))
  }
  return payload
}

const REAL_CLOCK = { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (t) => clearTimeout(t) }

// Leading + trailing: de eerste waarde gaat meteen, daarna hooguit één per
// `ms`, en de laatste waarde komt altijd aan. flush() stuurt een wachtende
// waarde meteen (bij loslaten van de schuif). `env` is de klok, voor tests.
export function throttle(fn, ms, env = REAL_CLOCK) {
  let last = -Infinity
  let timer = null
  let pending = false
  let value

  function fire() {
    if (timer !== null) env.clearTimeout(timer)
    timer = null
    pending = false
    last = env.now()
    fn(value)
  }

  return {
    call(next) {
      value = next
      pending = true
      const wait = last + ms - env.now()
      if (wait <= 0) return fire()
      if (timer === null) timer = env.setTimeout(fire, wait)
    },
    flush() {
      if (pending) fire()
    },
  }
}

// --- Detail-sheet: wat de bediening toont ---------------------------------

// Alleen een lamp die echt aan of uit is krijgt een bediening; bij
// unavailable/unknown zouden de schuiven verzonnen waarden tonen.
export function controlsVisible(state) {
  return state?.state === 'on' || state?.state === 'off'
}

// Welke kant van de Wit/Kleur-balk eerst getoond wordt: de huidige
// color_mode van de lamp, anders wit als de lamp dat kan.
export function initialMode(attributes) {
  const caps = capabilities(attributes)
  const mode = attributes?.color_mode
  if (mode === 'color_temp') return 'white'
  if (COLOUR_MODES.includes(mode)) return 'colour'
  return caps.white || !caps.colour ? 'white' : 'colour'
}

// De kleur van de lamp, of null als de lamp er geen heeft (uit, wit).
export function currentRgb(attributes) {
  return isRgb(attributes?.rgb_color) ? attributes.rgb_color : null
}

// Een staal is alleen gekozen als de lamp aan staat, in een kleurmodus, in
// die kleur. Een lamp die uit staat heeft geen gekozen kleur.
export function swatchSelected(state, swatchRgb) {
  if (state?.state !== 'on') return false
  const attributes = state.attributes
  const rgb = currentRgb(attributes)
  if (!COLOUR_MODES.includes(attributes?.color_mode) || !rgb) return false
  return rgb.every((c, i) => Math.abs(c - swatchRgb[i]) < 2)
}

export function brightnessLabel(state, percent) {
  return state?.state === 'on' ? `${percent}%` : 'Uit'
}

// De Wit-schuif heeft altijd een stand nodig, maar een getal alleen als de
// lamp echt wit brandt: uit of in kleur heeft hij geen kelvin.
export function kelvinLabel(state, kelvin) {
  if (state?.state !== 'on') return 'Uit'
  return Number.isFinite(state.attributes?.color_temp_kelvin) ? `${kelvin} K` : ''
}

// Na een eigen wijziging negeert de sheet de lamp-stand even: het echo van
// je eigen commando laat de schuif anders terugspringen. Een tijdvenster in
// plaats van een "ik sleep nog"-vlag, want die blijft hangen als je buiten
// de schuif loslaat. `env` is de klok, voor tests.
export function createHoldOff(ms, env = { now: () => Date.now() }) {
  let until = -Infinity
  return {
    touch() {
      until = env.now() + ms
    },
    active() {
      return env.now() < until
    },
    remaining() {
      return Math.max(0, until - env.now())
    },
  }
}

// Eén wachter per lamp: sleep je een schuif, dan gaat er om de 400 ms een
// commando de deur uit, maar alleen het nieuwste mag nog melden of de stand
// opnieuw ophalen. `begin` geeft een volgnummer bij het versturen; `register`
// bewaart de stop-functie van de wachter, en stopt een oudere stilletjes (ook
// als een ouder commando pas na een nieuwer terugkomt).
export function createLatestWatchers() {
  const latest = new Map() // key -> volgnummer van het nieuwste commando
  const stops = new Map() // key -> stop van de lopende wachter
  let seq = 0
  return {
    begin(key) {
      const token = ++seq
      latest.set(key, token)
      stops.get(key)?.()
      stops.delete(key)
      return token
    },
    register(key, token, stop) {
      if (latest.get(key) !== token) return stop()
      stops.set(key, stop)
    },
  }
}
