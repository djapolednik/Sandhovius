'use client'

import { useEffect, useState } from 'react'

// Een klok die elke `intervalMs` tikt, voor relatieve tijden ("2 minuten
// geleden"). Bewust een hook die je zo diep mogelijk in de boom gebruikt:
// alleen het component dat de tijd toont her-rendert, niet de hele pagina
// met alle device-kaarten.
export function useNow(intervalMs = 5000) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
