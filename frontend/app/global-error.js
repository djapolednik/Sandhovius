'use client'

import { useEffect } from 'react'
import { isStaleBuildError, sessionStore, shouldAutoReload } from '../lib/staleBuild'

// Het laatste vangnet (de root-layout zelf viel om). Krijgt geen app-CSS,
// dus eigen, minimale stijl in de kleuren van DESIGN.md; licht of donker
// volgt de telefoon. Zelfde gedrag als app/error.js: bij een oude versie één
// keer vanzelf herladen.
export default function GlobalError({ error }) {
  useEffect(() => {
    console.error('[app]', error)
    if (isStaleBuildError(error) && shouldAutoReload(sessionStore())) window.location.reload()
  }, [error])

  return (
    <html lang="nl">
      <body>
        <title>Sandhovius</title>
        <style>{`
          :root { color-scheme: light dark; }
          body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 1rem;
            background: #f4f1ec; color: #000; box-sizing: border-box;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          .card { width: min(100%, 26rem); box-sizing: border-box; background: #fff; border-radius: 28px; padding: 1.75rem 1.5rem 1.5rem; }
          h1 { margin: 0 0 0.4rem; font-size: 1.75rem; font-weight: 600; letter-spacing: -0.02em; }
          p { margin: 0 0 1.25rem; font-size: 1rem; line-height: 1.5; color: #5e626b; }
          button { width: 100%; min-height: 52px; border: none; border-radius: 999px; background: #0066ff; color: #fff;
            font: inherit; font-size: 1.05rem; font-weight: 600; cursor: pointer; }
          button:focus-visible { outline: 2px solid #0066ff; outline-offset: 2px; }
          @media (prefers-color-scheme: dark) {
            body { background: #100e0c; color: #fff; }
            .card { background: #17191d; border: 1px solid #2a2d33; }
            p { color: #a1a5ad; }
          }
        `}</style>
        <main className="card">
          <h1>Er ging iets mis.</h1>
          <p role="alert">Je huis werkt gewoon door; alleen de app liep vast. Laad hem opnieuw.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Opnieuw laden
          </button>
        </main>
      </body>
    </html>
  )
}
