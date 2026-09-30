'use client'

import { ArrowUpRightIcon, CheckIcon, PlusIcon, ScenesIcon } from '../lib/icons'
import { describeSchedules } from '../lib/schedules'

// "Leeslamp, Staande lamp en Thermostaat": wat een scène raakt, in woorden.
function describeScene(scene, deviceNameById) {
  const names = [...new Set((scene.actions ?? []).map((step) => deviceNameById[step.device]).filter(Boolean))]
  if (names.length === 0) return 'Nog geen apparaten'
  if (names.length <= 3) return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} en ${names.at(-1)}`
  return `${names.slice(0, 2).join(', ')} en nog ${names.length - 2}`
}

// Het tabblad Scènes: één tegel per scène. Een tik voert hem uit (op de
// box, zie runScene in page.js); "Wijzigen" opent de sheet. Tijdens het
// uitvoeren zegt de tegel dat, en daarna even "Klaar".
//
// runState: { [sceneId]: 'running' | 'done' }
export default function ScenesView({ scenes, schedules, deviceNameById, runState, canRun, onRun, onEdit, onCreate }) {
  if (scenes.length === 0) {
    return (
      <section className="panel intro-panel" aria-labelledby="scenes-empty-title">
        <div className="intro-panel-icons" aria-hidden="true">
          <span className="device-icon">
            <ScenesIcon width="22" height="22" />
          </span>
        </div>
        <h2 id="scenes-empty-title" className="intro-panel-title">
          Maak je eerste scène
        </h2>
        <p className="intro-panel-text">
          Met een scène zet je met één tik meerdere apparaten tegelijk goed, bijvoorbeeld "Naar bed": alle lampen uit en
          de verwarming lager.
        </p>
        <button type="button" className="btn btn-primary" onClick={onCreate}>
          <PlusIcon width="20" height="20" aria-hidden="true" />
          Scène maken
        </button>
      </section>
    )
  }

  return (
    <ul className="device-list scene-list">
      {scenes.map((scene) => {
        const state = runState[scene.id]
        const when = describeSchedules(schedules.filter((s) => s.scene === scene.id))
        return (
          <li key={scene.id} className="device-cell">
            <div className={`panel tile scene-tile ${state ? `scene-${state}` : ''}`}>
              <button
                type="button"
                className="device-card-action"
                aria-label={`Scène ${scene.name} uitvoeren`}
                disabled={!canRun || state === 'running'}
                onClick={() => onRun(scene)}
              />
              <span className="device-icon scene-icon" aria-hidden="true">
                <ScenesIcon width="22" height="22" />
              </span>
              <span className="scene-name">{scene.name}</span>
              {when && <span className="scene-when">{when}</span>}
              <span className="scene-summary" role="status">
                {state === 'running' ? (
                  <>
                    <span className="spinner spinner-inline" aria-hidden="true" />
                    Wordt uitgevoerd
                  </>
                ) : state === 'done' ? (
                  <>
                    <CheckIcon width="16" height="16" aria-hidden="true" />
                    Klaar
                  </>
                ) : (
                  describeScene(scene, deviceNameById)
                )}
              </span>
              <div className="tile-bottom">
                <button
                  type="button"
                  className="details-chip"
                  aria-label={`Scène ${scene.name} wijzigen`}
                  onClick={() => onEdit(scene)}
                >
                  Wijzigen
                  <ArrowUpRightIcon width="14" height="14" aria-hidden="true" />
                </button>
              </div>
            </div>
          </li>
        )
      })}
      <li className="device-cell">
        <button type="button" className="panel tile scene-new" onClick={onCreate}>
          <PlusIcon width="24" height="24" aria-hidden="true" />
          Nieuwe scène
        </button>
      </li>
    </ul>
  )
}
