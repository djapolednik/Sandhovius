'use client'

import { ArrowUpRightIcon, CheckIcon, ClockIcon, PlusIcon, ScenesIcon } from '../lib/icons'
import { describeDays, describeSchedules } from '../lib/schedules'

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
export default function ScenesView({
  scenes,
  schedules,
  deviceNameById,
  runState,
  canRun,
  onRun,
  onEdit,
  onCreate,
  onToggleSchedule,
}) {
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
    <>
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
      <ScheduleList scenes={scenes} schedules={schedules} onEdit={onEdit} onToggleSchedule={onToggleSchedule} />
    </>
  )
}

// Alle tijden waarop scènes vanzelf lopen, op één plek: per tijd een kaart
// met de tijd (het grootste woord), de scène en de dagen, en een
// schakelaar. Dat is een instelling, geen apparaatstand: Electric Blue,
// geen groen, en niets gloeit. Een tik op de kaart opent de scène.
function ScheduleList({ scenes, schedules, onEdit, onToggleSchedule }) {
  const sceneById = Object.fromEntries(scenes.map((scene) => [scene.id, scene]))
  const rows = schedules
    .filter((schedule) => sceneById[schedule.scene])
    .sort((a, b) => a.time.localeCompare(b.time) || sceneById[a.scene].name.localeCompare(sceneById[b.scene].name, 'nl'))

  return (
    <section className="schedules-section" aria-labelledby="schedules-heading">
      <h2 id="schedules-heading" className="section-heading">
        Vanzelf uitvoeren
      </h2>
      {rows.length === 0 ? (
        <p className="section-hint">
          Laat een scène vanzelf lopen, bijvoorbeeld elke werkdag om 07:00: kies Wijzigen bij een scène en dan Tijd
          toevoegen.
        </p>
      ) : (
        <ul className="schedule-list">
          {rows.map((schedule) => {
            const scene = sceneById[schedule.scene]
            const days = describeDays(schedule.days ?? []) || 'Geen dagen gekozen'
            return (
              <li key={schedule.id} className={`panel schedule-card ${schedule.enabled ? '' : 'schedule-card-off'}`}>
                <button
                  type="button"
                  className="device-card-action"
                  aria-label={`${scene.name} om ${schedule.time} wijzigen`}
                  onClick={() => onEdit(scene)}
                />
                <span className="device-icon" aria-hidden="true">
                  <ClockIcon width="22" height="22" />
                </span>
                <span className="schedule-card-text">
                  <span className="schedule-card-time">{schedule.time}</span>
                  <span className="schedule-card-name">{scene.name}</span>
                  <span className="schedule-card-days">{days}</span>
                  {schedule.enabled && schedule.last_error && (
                    <span className="schedule-card-error">De laatste keer niet gelukt</span>
                  )}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={schedule.enabled}
                  aria-label={`${scene.name} om ${schedule.time} vanzelf uitvoeren`}
                  className={`switch switch-accent schedule-card-switch ${schedule.enabled ? 'switch-on' : ''}`}
                  onClick={() => onToggleSchedule(schedule, !schedule.enabled)}
                >
                  <span className="switch-thumb" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
