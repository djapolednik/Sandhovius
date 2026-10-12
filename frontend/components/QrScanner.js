'use client'

import { useEffect, useRef } from 'react'
import { parseClaimLink } from '../lib/claim'

// Leest de QR-code op het blad bij je box met de camera. Eén keer om
// toestemming vragen: lukt de camera niet (geen HTTPS, geweigerd, geen
// camera) dan roept dit meteen onUnavailable(reden) aan en doet niets meer;
// de ouder toont dan het overtikformulier. onResult({ serial, code }) bij
// een Sandhovius-QR; andere QR-codes worden genegeerd.
//
// Hooguit 10 keer per seconde decoderen: elke keer is een getImageData plus
// jsQR op 640 px, en per beeld (~60/s) maakte dat telefoons warm. Het
// camerabeeld zelf blijft vloeiend, dat tekent de browser.
const SCAN_EVERY_MS = 100

export default function QrScanner({ onResult, onUnavailable }) {
  const videoRef = useRef(null)
  const callbacks = useRef({ onResult, onUnavailable })
  callbacks.current = { onResult, onUnavailable }

  useEffect(() => {
    let cancelled = false
    let stream = null
    let timer = 0

    function stop() {
      cancelled = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }

    async function start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        callbacks.current.onUnavailable('insecure')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
      } catch (err) {
        if (cancelled) return
        console.warn('[camera]', err?.name)
        callbacks.current.onUnavailable(err?.name === 'NotAllowedError' ? 'denied' : 'nocamera')
        return
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      const video = videoRef.current
      video.srcObject = stream
      try {
        await video.play()
      } catch {
        // Een onderbroken play() (sheet gesloten) is geen fout.
      }
      const { default: jsQR } = await import('jsqr')
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { willReadFrequently: true })

      function tick() {
        if (cancelled) return
        // Op de achtergrond niets decoderen; terug in beeld gaat het verder.
        if (!document.hidden && video.readyState >= 2 && video.videoWidth) {
          const scale = Math.min(1, 640 / video.videoWidth)
          canvas.width = Math.round(video.videoWidth * scale)
          canvas.height = Math.round(video.videoHeight * scale)
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const found = jsQR(image.data, image.width, image.height)
          const parsed = found ? parseClaimLink(found.data) : null
          if (parsed) {
            stop()
            callbacks.current.onResult(parsed)
            return
          }
        }
        timer = setTimeout(tick, SCAN_EVERY_MS)
      }
      tick()
    }

    start()
    return stop
  }, [])

  return (
    <div className="qr-scanner">
      <video ref={videoRef} className="qr-video" playsInline muted aria-label="Camerabeeld" />
      <div className="qr-frame" aria-hidden="true" />
    </div>
  )
}
