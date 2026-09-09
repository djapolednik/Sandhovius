// A cold-to-hot gradient for displaying a temperature reading. This is a
// fixed data-scale color (like a chart legend), independent of the
// light/dark theme, so it's plain JS rather than a CSS variable — it
// always needs the same blue-to-red mapping regardless of which theme is
// active.
const COLD = [37, 99, 235] // blue-600
const HOT = [220, 38, 38] // red-600
const MIN_C = 0
const MAX_C = 35

export function temperatureColor(celsius) {
  const t = Math.max(0, Math.min(1, (celsius - MIN_C) / (MAX_C - MIN_C)))
  const rgb = COLD.map((c, i) => Math.round(c + (HOT[i] - c) * t))
  return `rgb(${rgb.join(',')})`
}
