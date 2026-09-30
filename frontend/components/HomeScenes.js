'use client'

import { useRef } from 'react'
import { CheckIcon, ScenesIcon } from '../lib/icons'
import { useScrollEdges } from '../lib/useScrollEdges'

// Scènes op Home: één pil per scène, een tik voert hem uit. Alleen het
// rondje verandert (blauw met een spinner, dan even een vinkje), zodat de
// pil niet van breedte verspringt. Geen gloed: een scène is een opdracht,
// geen licht dat aan staat. Wijzigen gaat via het tabblad Scènes.
//
// runState: { [sceneId]: 'running' | 'done' }, gedeeld met ScenesView.
export default function HomeScenes({ scenes, runState, canRun, onRun }) {
  const stripRef = useRef(null)
  const edges = useScrollEdges(stripRef, scenes.length)

  return (
    <section className="home-section home-scenes" aria-labelledby="home-scenes">
      <h2 id="home-scenes" className="section-heading">
        Scènes
      </h2>
      <ul ref={stripRef} className={`scene-strip ${edges}`}>
        {scenes.map((scene) => {
          const state = runState[scene.id]
          return (
            <li key={scene.id}>
              <button
                type="button"
                className={`scene-pill ${state ? `scene-pill-${state}` : ''}`}
                aria-label={`Scène ${scene.name} uitvoeren`}
                disabled={!canRun || state === 'running'}
                onClick={() => onRun(scene)}
              >
                <span className="scene-pill-icon" aria-hidden="true">
                  {state === 'running' ? (
                    <span className="spinner scene-pill-spinner" />
                  ) : state === 'done' ? (
                    <CheckIcon width="16" height="16" />
                  ) : (
                    <ScenesIcon width="16" height="16" />
                  )}
                </span>
                {scene.name}
              </button>
              <span className="visually-hidden" role="status">
                {state === 'running' ? `${scene.name} wordt uitgevoerd` : state === 'done' ? `${scene.name} is klaar` : ''}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
