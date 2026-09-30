'use client'

import { useEffect, useState } from 'react'

// Voor een strook die horizontaal scrolt (kamers, scènes op Home): aan
// welke kant zit nog iets verborgen? De strook vervaagt dan aan die rand
// (.strip-more-start / .strip-more-end in rooms.css), zodat je ziet dát er
// meer is terwijl de scrollbalk zelf verborgen blijft.
export function useScrollEdges(ref, count) {
  const [edges, setEdges] = useState({ start: false, end: false })

  useEffect(() => {
    const strip = ref.current
    if (!strip) return
    function update() {
      const max = strip.scrollWidth - strip.clientWidth
      setEdges({ start: strip.scrollLeft > 2, end: strip.scrollLeft < max - 2 })
    }
    update()
    strip.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(strip)
    return () => {
      strip.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [ref, count])

  return `${edges.start ? 'strip-more-start' : ''} ${edges.end ? 'strip-more-end' : ''}`
}
