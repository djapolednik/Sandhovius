'use client'

import { CheckIcon, ScenesIcon } from '../lib/icons'
import { useScrollEdges } from '../lib/useScrollEdges'
import { useLongPress } from '../lib/longPress'

// Scènes op Home: één pil per scène, een tik voert hem uit. Alleen het
// rondje verandert (blauw met een spinner, dan even een vinkje), zodat de
// pil niet van breedte verspringt. Geen gloed: een scène is een opdracht,
// geen licht dat aan staat. Ingedrukt houden (of rechts klikken, of de
// contextmenutoets) opent de scène om te wijzigen, net als bij een
// apparaattegel.
//
// runState: { [sceneId]: 'running' | 'done' }, gedeeld met ScenesView.
export default function HomeScenes({ scenes, runState, canRun, onRun, onEdit }) {
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
              <ScenePill scene={scene} state={state} canRun={canRun} onRun={onRun} onEdit={onEdit} />
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

function ScenePill({ scene, state, canRun, onRun, onEdit }) {
  // Zijwaarts door de pillen schuiven of omlaag trekken is geen ingedrukt
  // houden (lib/longPress).
  const press = useLongPress(() => onEdit(scene))

  function handleClick() {
    // De klik die na een long-press volgt, voert de scène niet alsnog uit.
    if (press.consumeLongPress()) return
    if (canRun && state !== 'running') onRun(scene)
  }

  // Rechts klikken of de contextmenutoets; op een telefoon komt dit event
  // ook na de long-press, dan niet nog een keer openen.
  function handleContextMenu(e) {
    e.preventDefault()
    if (press.longPressFired()) return
    press.cancel()
    onEdit(scene)
  }

  // aria-disabled i.p.v. disabled: ook als de box onbereikbaar is of de
  // scène loopt, moet ingedrukt houden hem kunnen openen.
  const blocked = !canRun || state === 'running'
  return (
    <button
      type="button"
      className={`scene-pill ${state ? `scene-pill-${state}` : ''}`}
      aria-label={`Scène ${scene.name} uitvoeren`}
      aria-disabled={blocked ? true : undefined}
      onClick={handleClick}
      {...press.handlers}
      onContextMenu={handleContextMenu}
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
  )
}
