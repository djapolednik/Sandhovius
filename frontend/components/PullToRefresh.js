'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslations } from 'use-intl'
import { CheckIcon } from '../lib/icons'

// Hoe ver je moet trekken (zichtbare afstand, na de weerstand) voordat
// loslaten ververst, en waar het rondje blijft staan tijdens het verversen.
const THRESHOLD = 60
const MAX_PULL = 110
const HOLD_AT = 56
// Zo lang draait de spinner minstens: een verversing van 80ms zou anders
// alleen een flits zijn, en dan weet je niet of er iets gebeurde.
const MIN_SPIN_MS = 600
const DONE_MS = 450

// Een elastiek: de eerste centimeters volgen je vinger bijna 1-op-1,
// daarna wordt het steeds stroever en komt het nooit verder dan MAX_PULL.
function rubberBand(raw) {
  return MAX_PULL * (1 - 1 / ((raw * 0.8) / MAX_PULL + 1))
}

// In een browsertab heeft de telefoon zijn eigen omlaag-trekken-om-te-
// verversen. In de geïnstalleerde app (beginscherm) niet: daar doen we het
// zelf. localStorage 'sandhovius-pull-refresh' = 'on' zet het ook in een
// tab aan, om te testen.
function isEnabled() {
  try {
    if (window.localStorage.getItem('sandhovius-pull-refresh') === 'on') return true
  } catch {}
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

// Omlaag trekken bovenaan de pagina haalt alles opnieuw op (onRefresh
// geeft een promise). Het rondje volgt je vinger; tijdens het slepen zetten
// we de transform rechtstreeks op het element, zonder React-render per
// beweging, zodat het ook op een trage telefoon vloeiend blijft.
export default function PullToRefresh({ onRefresh }) {
  const indicatorRef = useRef(null)
  const onRefreshRef = useRef(onRefresh)
  // Na de render bijwerken, niet tijdens (React 19): gelezen in handlers en timers.
  useLayoutEffect(() => {
    onRefreshRef.current = onRefresh
  })
  // idle | pulling | armed | refreshing | done
  const [phase, setPhase] = useState('idle')
  const phaseRef = useRef('idle')
  const t = useTranslations('refresh')
  // Wat een schermlezer hoort: een stand, de woorden pas bij het tekenen.
  const [announce, setAnnounce] = useState(null) // null | 'refreshing' | 'done'

  useEffect(() => {
    if (!isEnabled()) return
    const el = indicatorRef.current
    let start = null
    let tracking = false
    let distance = 0

    const set = (next) => {
      phaseRef.current = next
      setPhase(next)
    }
    const place = (y, animate) => {
      el.style.transition = animate ? '' : 'none'
      el.style.setProperty('--pull', `${y}px`)
      el.style.setProperty('--progress', Math.min(1, y / THRESHOLD))
    }

    function onStart(e) {
      if (phaseRef.current === 'refreshing' || phaseRef.current === 'done') return
      if (e.touches.length !== 1 || window.scrollY > 0) return
      if (document.querySelector('dialog[open]')) return
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      tracking = false
      distance = 0
    }

    function onMove(e) {
      if (!start) return
      const dx = e.touches[0].clientX - start.x
      const dy = e.touches[0].clientY - start.y
      if (!tracking) {
        // Eerst de richting: zijwaarts (kamer- of urenstrook) of omhoog is
        // niet voor ons.
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) {
          start = null
          return
        }
        tracking = true
        set('pulling')
      }
      // Zelf de pagina vasthouden, anders stuitert iOS mee.
      e.preventDefault()
      distance = rubberBand(Math.max(0, dy))
      place(distance, false)
      const armed = distance >= THRESHOLD
      if (armed && phaseRef.current !== 'armed') {
        set('armed')
        navigator.vibrate?.(8)
      } else if (!armed && phaseRef.current === 'armed') set('pulling')
    }

    async function onEnd() {
      if (!start) return
      start = null
      if (!tracking) return
      tracking = false
      if (phaseRef.current !== 'armed') {
        set('idle')
        place(0, true)
        return
      }
      set('refreshing')
      setAnnounce('refreshing')
      place(HOLD_AT, true)
      const began = Date.now()
      try {
        await onRefreshRef.current?.()
      } finally {
        await new Promise((resolve) => setTimeout(resolve, Math.max(0, MIN_SPIN_MS - (Date.now() - began))))
        set('done')
        setAnnounce('done')
        await new Promise((resolve) => setTimeout(resolve, DONE_MS))
        set('idle')
        place(0, true)
      }
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  return (
    <>
      <div ref={indicatorRef} className={`pull-refresh pull-refresh-${phase}`} aria-hidden="true">
        {phase === 'refreshing' ? (
          <span className="pull-refresh-spinner" />
        ) : phase === 'done' ? (
          <CheckIcon width="18" height="18" />
        ) : (
          <svg className="pull-refresh-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M6 13l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span className="visually-hidden" role="status">
        {announce && t(announce)}
      </span>
    </>
  )
}
