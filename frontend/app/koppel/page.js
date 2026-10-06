'use client'

import { useEffect } from 'react'
import { parseClaimLink, pendingKey } from '../../lib/claim'

// De QR-code op het blad bij de box opent deze pagina. We bewaren de code
// (sessionStorage, alleen dit tabblad) en gaan naar de app; die opent de
// koppelsheet zodra je ingelogd en bevestigd bent. De code staat zo niet
// langer dan nodig in de adresbalk.
export default function Page() {
  useEffect(() => {
    const found = parseClaimLink(window.location.href)
    if (found) {
      try {
        window.sessionStorage.setItem(pendingKey, JSON.stringify(found))
      } catch {}
    }
    window.location.replace('/')
  }, [])
  return null
}
