import { useLayoutEffect, useRef } from 'react'

// Ingedrukt houden (een tegel, een scènepil) opent de details. Gedeeld door
// DeviceCard en HomeScenes.
export const LONG_PRESS_MS = 500

// Hoe ver een vinger mag bewegen en het nog "stil houden" is. Beweegt hij
// verder, dan is het trekken (verversen) of scrollen, geen long-press.
// Nodig omdat omlaag trekken om te verversen preventDefault doet: dan stuurt
// de browser geen pointercancel, en zonder deze grens ging na een halve
// seconde trekken de sheet van de tegel onder je duim open.
export const MOVE_SLOP_PX = 10

export function movedBeyondSlop(start, x, y, slop = MOVE_SLOP_PX) {
  return Math.hypot(x - start.x, y - start.y) > slop
}

// useLongPress(onLongPress) geeft de pointer-handlers voor het element en
// consumeLongPress(): true als de long-press net afging (dan hoort de klik
// die na het loslaten volgt niet ook nog te schakelen), en zet hem terug.
export function useLongPress(onLongPress) {
  const timer = useRef(null)
  const start = useRef(null)
  const triggered = useRef(false)
  const callback = useRef(onLongPress)
  // Na de render bijwerken, niet tijdens (React 19): gelezen in handlers en timers.
  useLayoutEffect(() => {
    callback.current = onLongPress
  })

  function cancel() {
    clearTimeout(timer.current)
    timer.current = null
    start.current = null
  }

  function onPointerDown(e) {
    if (e.button > 0) return
    triggered.current = false
    start.current = { x: e.clientX, y: e.clientY }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      start.current = null
      triggered.current = true
      callback.current()
    }, LONG_PRESS_MS)
  }

  function onPointerMove(e) {
    if (start.current && movedBeyondSlop(start.current, e.clientX, e.clientY)) cancel()
  }

  function consumeLongPress() {
    const was = triggered.current
    triggered.current = false
    return was
  }

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp: cancel, onPointerLeave: cancel, onPointerCancel: cancel },
    // Voor het contextmenu-event dat een telefoon na een long-press stuurt.
    longPressFired: () => triggered.current,
    cancel,
    consumeLongPress,
  }
}
