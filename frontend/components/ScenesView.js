'use client'

import { useIntl } from '../app/LanguageContext'
import { cachedFormat } from '../lib/language'
import { ArrowUpRightIcon, CheckIcon, ClockIcon, MotionIcon, PlusIcon, ScenesIcon } from '../lib/icons'
import { describeDays, describeSchedules, isSun, scheduleSortKey, scheduleWhen } from '../lib/schedules'
import { describeLightStep } from '../lib/sceneChoices'
import { describeMotionLight } from '../lib/motionLights'

// "Leeslamp, Staande lamp en Thermostaat": wat een scène raakt, in woorden.
function describeScene({ t, locale }, scene, deviceNameById) {
  const names = [
    ...new Set(
      (scene.actions ?? [])
        .filter((step) => deviceNameById[step.device])
        .map((step) => {
          const name = deviceNameById[step.device]
          const detail = step.action === 'turn_on' ? describeLightStep(t, step.payload) : ''
          return detail ? `${name} (${detail})` : name
        }),
    ),
  ]
  if (names.length === 0) return t('scenes.noDevices')
  const list = cachedFormat(Intl.ListFormat, locale, { type: 'conjunction' })
  if (names.length <= 3) return list.format(names)
  return list.format([...names.slice(0, 2), t('scenes.andMore', { count: names.length - 2 })])
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
  motionLights = [],
  deviceById = {},
  onEditMotion,
  onToggleMotion,
}) {
  const intl = useIntl()
  const { t } = intl
  // Bewegingslichten hebben geen scène nodig: ook zonder scènes staan ze er.
  const motion = (
    <MotionList motionLights={motionLights} deviceById={deviceById} onEdit={onEditMotion} onToggle={onToggleMotion} />
  )
  if (scenes.length === 0) {
    return (
      <>
      <section className="panel intro-panel" aria-labelledby="scenes-empty-title">
        <div className="intro-panel-icons" aria-hidden="true">
          <span className="device-icon">
            <ScenesIcon width="22" height="22" />
          </span>
        </div>
        <h2 id="scenes-empty-title" className="intro-panel-title">
          {t('scenes.firstTitle')}
        </h2>
        <p className="intro-panel-text">{t('scenes.firstText')}</p>
        <button type="button" className="btn btn-primary" onClick={onCreate}>
          <PlusIcon width="20" height="20" aria-hidden="true" />
          {t('scenes.create')}
        </button>
      </section>
      {motion}
      </>
    )
  }

  return (
    <>
      <ul className="device-list scene-list">
        {scenes.map((scene) => {
          const state = runState[scene.id]
          const when = describeSchedules(intl, schedules.filter((s) => s.scene === scene.id))
          return (
            <li key={scene.id} className="device-cell">
              <div className={`panel tile scene-tile ${state ? `scene-${state}` : ''}`}>
                <button
                  type="button"
                  className="device-card-action"
                  aria-label={t('scenes.run', { name: scene.name })}
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
                      {t('scenes.runningShort')}
                    </>
                  ) : state === 'done' ? (
                    <>
                      <CheckIcon width="16" height="16" aria-hidden="true" />
                      {t('scenes.doneShort')}
                    </>
                  ) : (
                    describeScene(intl, scene, deviceNameById)
                  )}
                </span>
                <div className="tile-bottom">
                  <button
                    type="button"
                    className="details-chip"
                    aria-label={t('scenes.editLabel', { name: scene.name })}
                    onClick={() => onEdit(scene)}
                  >
                    {t('scenes.edit')}
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
            {t('scenes.new')}
          </button>
        </li>
      </ul>
      <ScheduleList scenes={scenes} schedules={schedules} onEdit={onEdit} onToggleSchedule={onToggleSchedule} />
      {motion}
    </>
  )
}

// Alle tijden waarop scènes vanzelf lopen, op één plek: per tijd een kaart
// met de tijd (het grootste woord), de scène en de dagen, en een
// schakelaar. Dat is een instelling, geen apparaatstand: Electric Blue,
// geen groen, en niets gloeit. Een tik op de kaart opent de scène.
function ScheduleList({ scenes, schedules, onEdit, onToggleSchedule }) {
  const intl = useIntl()
  const { t, locale } = intl
  const sceneById = Object.fromEntries(scenes.map((scene) => [scene.id, scene]))
  const rows = schedules
    .filter((schedule) => sceneById[schedule.scene])
    .sort(
      (a, b) =>
        scheduleSortKey(a).localeCompare(scheduleSortKey(b)) ||
        sceneById[a.scene].name.localeCompare(sceneById[b.scene].name, locale)
    )

  return (
    <section className="schedules-section" aria-labelledby="schedules-heading">
      <h2 id="schedules-heading" className="section-heading">
        {t('scenes.schedulesTitle')}
      </h2>
      {rows.length === 0 ? (
        <p className="section-hint">{t('scenes.schedulesHint')}</p>
      ) : (
        <ul className="schedule-list">
          {rows.map((schedule) => {
            const scene = sceneById[schedule.scene]
            const days = describeDays(intl, schedule.days ?? []) || t('scenes.noDays')
            const sun = isSun(schedule)
            // Een zon-schema: de tijd van vandaag als grootste woord (de box
            // rekent hem uit), en eronder de zon in woorden.
            const big = sun ? (schedule.next_run ? scheduleSortKey(schedule) : t(`sceneSheet.triggers.${schedule.trigger}`)) : schedule.time
            const noLocation = sun && schedule.last_error === 'no_location'
            const when = scheduleWhen(intl, schedule)
            return (
              <li key={schedule.id} className={`panel schedule-card ${schedule.enabled ? '' : 'schedule-card-off'}`}>
                <button
                  type="button"
                  className="device-card-action"
                  aria-label={
                    sun
                      ? t('scenes.editScheduleWhen', { name: scene.name, when })
                      : t('scenes.editSchedule', { name: scene.name, time: schedule.time })
                  }
                  onClick={() => onEdit(scene)}
                />
                <span className="device-icon" aria-hidden="true">
                  <ClockIcon width="22" height="22" />
                </span>
                <span className="schedule-card-text">
                  <span className="schedule-card-time">{big}</span>
                  <span className="schedule-card-name">{scene.name}</span>
                  <span className="schedule-card-days">
                    {sun ? t('schedules.daysWhen', { days, when }) : days}
                  </span>
                  {schedule.enabled && noLocation && <span className="schedule-card-error">{t('scenes.noLocation')}</span>}
                  {schedule.enabled && schedule.last_error && !noLocation && (
                    <span className="schedule-card-error">{t('scenes.lastFailed')}</span>
                  )}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={schedule.enabled}
                  aria-label={
                    sun
                      ? t('scenes.scheduleSwitchWhen', { name: scene.name, when })
                      : t('scenes.scheduleSwitch', { name: scene.name, time: schedule.time })
                  }
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

// Bewegingslichten: per regel een kaart in de stijl van de schema's, met de
// sensor als titel (dat is wat je zoekt: "de gang"). Een instelling, dus de
// schakelaar is Electric Blue en niets gloeit. Een tik opent de sheet.
function MotionList({ motionLights, deviceById, onEdit, onToggle }) {
  const intl = useIntl()
  const { t } = intl
  const names = Object.fromEntries(Object.values(deviceById).map((d) => [d.id, d.name]))
  const rows = [...motionLights].sort((a, b) =>
    (names[a.sensor] ?? '').localeCompare(names[b.sensor] ?? '', intl.locale)
  )

  return (
    <section className="schedules-section" aria-labelledby="motion-heading">
      <h2 id="motion-heading" className="section-heading">
        {t('motion.title')}
      </h2>
      {rows.length === 0 && <p className="section-hint">{t('motion.hint')}</p>}
      <ul className="schedule-list">
        {rows.map((rule) => {
          const sensor = deviceById[rule.sensor]
          const name = sensor?.name ?? t('motion.sensor')
          return (
            <li key={rule.id} className={`panel schedule-card ${rule.enabled ? '' : 'schedule-card-off'}`}>
              <button
                type="button"
                className="device-card-action"
                aria-label={t('motion.edit', { name })}
                onClick={() => onEdit(rule)}
              />
              <span className="device-icon" aria-hidden="true">
                <MotionIcon width="22" height="22" />
              </span>
              <span className="schedule-card-text">
                <span className="schedule-card-name">{name}</span>
                <span className="schedule-card-days">{describeMotionLight(intl, rule, names)}</span>
                {rule.only_dark && <span className="schedule-card-days">{t('motion.onlyDark')}</span>}
                {rule.enabled && sensor && !sensor.online && (
                  <span className="schedule-card-error">{t('motion.sensorOffline')}</span>
                )}
                {rule.enabled && rule.last_error && <span className="schedule-card-error">{t('motion.lastFailed')}</span>}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={rule.enabled}
                aria-label={t('motion.switchLabel', { name })}
                className={`switch switch-accent schedule-card-switch ${rule.enabled ? 'switch-on' : ''}`}
                onClick={() => onToggle(rule, !rule.enabled)}
              >
                <span className="switch-thumb" />
              </button>
            </li>
          )
        })}
        <li>
          <button type="button" className="btn btn-plain schedule-add motion-add" onClick={() => onEdit('new')}>
            <PlusIcon width="18" height="18" aria-hidden="true" />
            {t('motion.add')}
          </button>
        </li>
      </ul>
    </section>
  )
}
