'use client'

import { useEffect, useRef, useState } from 'react'
import { useIntl } from '../app/LanguageContext'
import Modal from './Modal'
import { householdError } from '../lib/household'
import { CheckIcon, LightbulbIcon, PlugIcon, ThermometerIcon, ThermostatIcon, deviceTypeIcon } from '../lib/icons'
import { PAIRING_KINDS, doneLine, instructionKey, openSessionChoice, secondsLeft, visibleCandidates } from '../lib/pairing'
import { useNow } from '../lib/useNow'

const OPEN = ['starting', 'open', 'waiting_button']

// Een echt apparaat toevoegen (spec 2026-10-14-device-pairing-design.md):
// soort kiezen, de box zoekt, het gevonden apparaat kiezen (laten
// knipperen), naam en kamer, klaar. De sessie en wat de box vindt staan in
// PocketBase (pairing_sessions, pairing_candidates); de sheet beheert ze
// zelf, zoals ClaimSheet de koppeling van een box. Sluiten sluit de sessie:
// de box haalt dan van het netwerk wat niet is toegevoegd.
export default function PairingSheet({ pb, houseId, rooms, defaultRoomId = '', houseReachable, onAdded, onClose }) {
  const intl = useIntl()
  const { t } = intl
  const [session, setSession] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [choosing, setChoosing] = useState(null) // candidate-id met het formulier open
  const [form, setForm] = useState({ name: '', room: defaultRoomId })
  const [help, setHelp] = useState(false)
  const [view, setView] = useState('search') // search | done
  const sessionRef = useRef(null)
  const reported = useRef(new Set())

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  // Weggaan sluit de sessie, ook als de sheet zonder "Sluiten" verdwijnt.
  useEffect(() => () => closeSession(sessionRef.current), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime op de eigen sessie en haar candidates, en één keer nalezen: de
  // box zet een sessie binnen milliseconden op "open", vaak vóór het
  // abonnement er is.
  useEffect(() => {
    if (!session?.id) return
    const id = session.id
    let cancelled = false
    const subs = [
      pb.collection('pairing_sessions').subscribe(id, (e) => setSession(e.record)),
      pb.collection('pairing_candidates').subscribe(
        '*',
        (e) => setCandidates((prev) => [...prev.filter((c) => c.id !== e.record.id), e.record]),
        { filter: `session = "${id}"` }
      ),
    ]
    Promise.all(subs).then(async () => {
      const [s, list] = await Promise.all([
        pb.collection('pairing_sessions').getOne(id),
        pb.collection('pairing_candidates').getFullList({ filter: `session = "${id}"` }),
      ])
      if (!cancelled) {
        setSession(s)
        setCandidates(list)
      }
    })
    return () => {
      cancelled = true
      subs.forEach((p) => p.then((unsubscribe) => unsubscribe()).catch(() => {}))
    }
  }, [pb, session?.id])

  // Een nieuw toegevoegd apparaat: Klaar laten zien, en page.js laten weten.
  const added = candidates.filter((c) => c.status === 'added')
  useEffect(() => {
    for (const c of candidates) {
      if (c.status !== 'added' || reported.current.has(c.id)) continue
      reported.current.add(c.id)
      onAdded?.(c)
      setChoosing(null)
      setView('done')
    }
  }, [candidates, onAdded])

  function closeSession(s) {
    if (s && OPEN.includes(s.status)) {
      pb.collection('pairing_sessions').update(s.id, { status: 'closed' }).catch(() => {})
    }
  }

  function close() {
    closeSession(session)
    sessionRef.current = null
    onClose()
  }

  async function start(kind, retried = false) {
    setError('')
    setStarting(true)
    try {
      const s = await pb.collection('pairing_sessions').create({ house: houseId, kind, status: 'starting' })
      setCandidates([])
      setView('search')
      setSession(s)
    } catch (err) {
      // Je eigen sessie van daarnet (app gesloten tijdens het zoeken):
      // overnemen of vervangen, in plaats van vier minuten "wordt al gezocht".
      if (err?.response?.code === 'session_open' && !retried) {
        const open = await pb
          .collection('pairing_sessions')
          .getFirstListItem(`house = "${houseId}" && (status = "starting" || status = "open" || status = "waiting_button")`)
          .catch(() => null)
        const choice = openSessionChoice(open, pb.authStore.record?.id, kind)
        if (choice === 'resume') {
          setCandidates([])
          setView('search')
          setSession(open)
          setStarting(false)
          return
        }
        if (choice === 'replace') {
          await pb.collection('pairing_sessions').update(open.id, { status: 'closed' }).catch(() => {})
          return start(kind, true)
        }
      }
      setError(householdError(t, t('errors.what.addDevice'), err))
    } finally {
      setStarting(false)
    }
  }

  function again() {
    closeSession(session)
    setSession(null)
    setCandidates([])
    setHelp(false)
    setView('search')
  }

  function patchCandidate(c, fields) {
    pb.collection('pairing_candidates')
      .update(c.id, fields)
      .catch((err) => setError(householdError(t, t('errors.what.addDevice'), err)))
  }

  function choose(c) {
    setChoosing(c.id)
    setForm({ name: '', room: defaultRoomId })
  }

  function add(e, c) {
    e.preventDefault()
    patchCandidate(c, { name: form.name.trim(), room: form.room || '', add: true })
  }

  const kind = session?.kind
  let body
  if (!houseReachable && !session) {
    body = <p className="login-note">{t('pairing.boxUnreachable')}</p>
  } else if (!session) {
    body = (
      <div className="form-stack">
        <div className="type-picker">
          <p className="form-label">{t('addDevice.what')}</p>
          <div className="type-picker-grid">
            {PAIRING_KINDS.map((value) => {
              const Icon = deviceTypeIcon(value)
              return (
                <button key={value} type="button" className="type-tile" disabled={starting} onClick={() => start(value)}>
                  <span className={`device-icon device-icon-${value} type-tile-icon`}>
                    <Icon />
                  </span>
                  <span className="type-tile-label">{t(`device.types.${value}`)}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="type-picker">
          <p className="form-label">{t('pairing.viaBrand')}</p>
          <div className="type-picker-grid">
            <button type="button" className="type-tile" disabled={starting} onClick={() => start('hue')}>
              <span className="device-icon device-icon-light type-tile-icon">
                <LightbulbIcon />
              </span>
              <span className="type-tile-label">{t('pairing.brands.hue')}</span>
            </button>
          </div>
        </div>
      </div>
    )
  } else if (view === 'done') {
    body = (
      <div className="form-stack">
        <p className="pairing-done" role="status">
          <span className="pairing-done-icon" aria-hidden="true">
            <CheckIcon width="20" height="20" />
          </span>
          {doneLine(intl, added)}
        </p>
        <div className="pairing-done-actions">
          <button type="button" className="btn btn-secondary" onClick={() => (OPEN.includes(session.status) ? setView('search') : again())}>
            {t('pairing.addAnother')}
          </button>
          <button type="button" className="btn btn-primary" onClick={close}>
            {t('pairing.ready')}
          </button>
        </div>
      </div>
    )
  } else if (session.status === 'failed' || session.status === 'closed') {
    const code = session.error && t.has(`errors.codes.${session.error}`) ? `errors.codes.${session.error}` : 'pairing.stopped'
    body = (
      <div className="form-stack">
        <p className={session.status === 'failed' ? 'login-error' : 'login-note'} role="status">
          {t(code)}
        </p>
        <button type="button" className="btn btn-primary" onClick={again}>
          {t('pairing.searchAgain')}
        </button>
      </div>
    )
  } else if (session.status === 'waiting_button') {
    body = (
      <div className="form-stack">
        <p className="pairing-instruction">{t(instructionKey('hue'))}</p>
        {session.error && (
          <p className="login-error" role="alert">
            {t(`errors.codes.${session.error}`)}
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => pb.collection('pairing_sessions').update(session.id, { button_pressed: true }).catch(() => {})}
        >
          {t('pairing.buttonPressed')}
        </button>
      </div>
    )
  } else {
    const list = visibleCandidates(candidates)
    body = (
      <div className="form-stack">
        {kind !== 'hue' && <p className="pairing-instruction">{t(instructionKey(kind))}</p>}
        <SearchLine session={session} />
        <ul className="pairing-list">
          {list.map((c) => (
            <CandidateRow
              key={c.id}
              candidate={c}
              rooms={rooms}
              open={choosing === c.id}
              form={form}
              setForm={setForm}
              onChoose={() => choose(c)}
              onBlink={() => patchCandidate(c, { identify: (c.identify ?? 0) + 1 })}
              onAdd={(e) => add(e, c)}
            />
          ))}
        </ul>
        <p className="login-note">{t('pairing.mayTakeAWhile')}</p>
        {session.status === 'open' && kind !== 'hue' && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => pb.collection('pairing_sessions').update(session.id, { extend: true }).catch(() => {})}
          >
            {t('pairing.searchLonger')}
          </button>
        )}
        <div className="pairing-help-buttons">
          <button type="button" className="btn btn-plain" aria-expanded={help} onClick={() => setHelp(!help)}>
            {t('pairing.notBlinking')}
          </button>
          <button type="button" className="btn btn-plain" aria-expanded={help} onClick={() => setHelp(!help)}>
            {t(`pairing.notSeen.${kind}`)}
          </button>
        </div>
        {help && (
          <div className="pairing-help">
            <p className="form-label">{t('pairing.help.title')}</p>
            <ul>
              {['power', 'closer', 'restart', 'reset'].map((tip) => (
                <li key={tip}>{t(`pairing.help.${tip}`)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  return (
    <Modal title={t('pairing.title')} onClose={close}>
      {body}
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  )
}

// "Zoeken, nog 3:40": een eigen component, zodat alleen deze regel elke
// seconde opnieuw tekent.
function SearchLine({ session }) {
  const { t } = useIntl()
  const now = useNow(1000)
  if (session.status !== 'open') {
    return (
      <p className="claim-wait" role="status">
        <span className="claim-pulse" aria-hidden="true" />
        {t(session.kind === 'hue' ? 'pairing.connecting' : 'common.loading')}
      </p>
    )
  }
  const s = secondsLeft(session.expires, now)
  const time = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  return (
    <p className="claim-wait">
      <span className="claim-pulse" aria-hidden="true" />
      {t('pairing.searching', { time })}
    </p>
  )
}

function CandidateRow({ candidate: c, rooms, open, form, setForm, onChoose, onBlink, onAdd }) {
  const { t } = useIntl()
  const waiting = c.status === 'interviewing'
  const title = waiting
    ? t('device.pairing')
    : c.status === 'unsupported'
      ? t('pairing.unsupported')
      : c.endpoint
        ? t('pairing.part', { type: t(`device.types.${c.type}`), number: c.endpoint.replace(/\D/g, '') })
        : t(`device.types.${c.type}`)
  return (
    <li className={`pairing-row ${waiting ? 'pairing-row-waiting' : ''}`}>
      <div className="pairing-row-main">
        <span className={`device-icon device-icon-${c.type || 'light'}`} aria-hidden="true">
          {waiting ? <span className="spinner spinner-inline" /> : <TypeIcon type={c.type || 'light'} />}
        </span>
        <span className="pairing-row-text">
          <span className="pairing-row-title">{title}</span>
          {c.model && c.status !== 'unsupported' && <span className="pairing-row-meta">{c.model}</span>}
        </span>
      </div>
      {c.status === 'found' && !open && (
        <div className="pairing-row-actions">
          {c.type === 'light' && (
            <button type="button" className="btn btn-secondary" onClick={onBlink}>
              {t('pairing.blink')}
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onChoose}>
            {t('pairing.add')}
          </button>
        </div>
      )}
      {c.status === 'adding' && (
        <p className="claim-wait" role="status">
          <span className="spinner spinner-inline" aria-hidden="true" />
          {t('pairing.adding')}
        </p>
      )}
      {c.status === 'found' && open && (
        <form className="form-stack pairing-form" onSubmit={onAdd}>
          <p className="form-label">{t('pairing.nameAndRoom')}</p>
          <label className="form-field">
            <span className="form-label">{t('deviceSheet.name')}</span>
            <input
              className="input"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t(`addDevice.examples.${c.type}`)}
              required
              autoFocus
            />
          </label>
          <label className="form-field">
            <span className="form-label">{t('deviceSheet.room')}</span>
            <select className="input" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })}>
              <option value="">{t('home.noRoom')}</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            {c.type === 'light' && (
              <button type="button" className="btn btn-secondary" onClick={onBlink}>
                {t('pairing.blink')}
              </button>
            )}
            <button type="submit" className="btn btn-primary">
              {t('pairing.add')}
            </button>
          </div>
        </form>
      )}
    </li>
  )
}

// Het icoon van een soort, als vaste elementen (deviceTypeIcon geeft een
// component terug; de React-compiler ziet dat als "component in render").
function TypeIcon({ type }) {
  switch (type) {
    case 'switch':
      return <PlugIcon />
    case 'sensor':
      return <ThermometerIcon />
    case 'climate':
      return <ThermostatIcon />
    default:
      return <LightbulbIcon />
  }
}
