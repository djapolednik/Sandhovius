'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'use-intl'
import Modal from './Modal'
import QrScanner from './QrScanner'
import VerifyNotice from './VerifyNotice'
import { claimError, codeProblem, formatCode, isBoxOnline, normalizeSerial, pendingKey } from '../lib/claim'

// Waarom de camera niet kan: de woorden staan onder claim.camera.<reden>.
const CAMERA_REASONS = ['insecure', 'denied', 'nocamera']

function clearPending() {
  try {
    window.sessionStorage.removeItem(pendingKey)
  } catch {}
}

// Een box aan je account koppelen: scannen of overtikken, kiezen of het
// een nieuw huis wordt of de box van een bestaand huis vervangt, en dan
// wachten tot de box zich meldt. initial = { serial, code } uit een
// link of QR (de code blijft in sessionStorage tot het koppelen lukt of
// je de sheet sluit, ook als je eerst je e-mailadres moet bevestigen).
// pb: PocketBase-client. houses: eigen huizen, live bijgewerkt.
// onClaimed(houseId): de huizen opnieuw ophalen en dit huis tonen.
export default function ClaimSheet({ pb, user, houses, initial, onClaimed, onClose }) {
  const t = useTranslations()
  const [verified, setVerified] = useState(Boolean(user?.verified))
  const [mode, setMode] = useState(initial ? 'form' : 'scan') // scan | form
  const [cameraNote, setCameraNote] = useState('')
  const [serial, setSerial] = useState(initial?.serial ?? '')
  const [code, setCode] = useState(initial?.code ?? '')
  const [target, setTarget] = useState('new') // 'new' of een huis-id
  // Een voorstel dat je ziet en kunt wijzigen, in de taal van de app.
  const [houseName, setHouseName] = useState(() => t('claim.defaultHouseName'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [claimed, setClaimed] = useState(null) // { houseId, claimedAt }

  function close() {
    clearPending()
    onClose()
  }

  // Het bevestigen gebeurt vaak in een ander tabblad (de link in de mail):
  // ververs het account zodra je terugkomt en elke paar seconden.
  useEffect(() => {
    if (verified) return
    let stopped = false
    async function check() {
      try {
        const res = await pb.collection('users').authRefresh()
        if (!stopped && res.record?.verified) setVerified(true)
      } catch (err) {
        console.error('[authRefresh]', err)
      }
    }
    const timer = setInterval(check, 4000)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [verified, pb])

  // Na het koppelen: wachten op de eerste hartslag van de box.
  const claimedHouse = claimed ? houses.find((h) => h.id === claimed.houseId) : null
  const online = claimed ? isBoxOnline(claimedHouse, claimed.claimedAt) : false
  useEffect(() => {
    if (!online) return
    const timer = setTimeout(close, 1200)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  async function submit(e) {
    e.preventDefault()
    // Een tikfout zie je meteen, zonder serverpoging (die telt mee voor de
    // rate limit en zegt alleen "klopt niet").
    const problem = codeProblem(code)
    if (problem) {
      setError(t(problem))
      return
    }
    setBusy(true)
    setError('')
    const body = { serial: normalizeSerial(serial), code }
    if (target === 'new') body.house_name = houseName.trim() || t('claim.defaultHouseName')
    else body.replace_house = target
    let res
    try {
      res = await pb.send('/api/sandhovius/claim', { method: 'POST', body })
    } catch (err) {
      console.error('[koppelen]', err?.status)
      if (err?.status === 403) setVerified(false)
      setError(claimError(t, err))
      setBusy(false)
      return
    }
    // Gekoppeld. Wat hierna misgaat is geen fout voor de bewoner: zonder
    // claimed_at van de server rekenen we vanaf nu.
    clearPending()
    let claimedAt = new Date().toISOString()
    try {
      const house = await pb.collection('houses').getOne(res.house)
      if (house.claimed_at) claimedAt = house.claimed_at
    } catch (err) {
      console.error('[koppelen: huis ophalen]', err?.status)
    }
    setClaimed({ houseId: res.house, claimedAt })
    setBusy(false)
    try {
      await onClaimed(res.house)
    } catch (err) {
      console.error('[koppelen: huizen verversen]', err?.status)
    }
  }

  let body
  if (claimed) {
    body = online ? (
      <p className="login-note" role="status">
        {t('claim.online')}
      </p>
    ) : (
      <div className="form-stack">
        <p className="claim-wait" role="status">
          <span className="claim-pulse" aria-hidden="true" />
          {t('claim.waiting')}
        </p>
        <p className="login-note">
          {t('claim.waitingNote')}
        </p>
        <button type="button" className="btn btn-secondary" onClick={close}>
          {t('common.close')}
        </button>
      </div>
    )
  } else if (!verified) {
    body = (
      <VerifyNotice email={user?.email} onResend={() => pb.collection('users').requestVerification(user.email)}>
        <p className="login-note">
          {t('claim.verifyNote')}
        </p>
      </VerifyNotice>
    )
  } else if (mode === 'scan') {
    body = (
      <div className="form-stack">
        <p className="login-note">{t('claim.aim')}</p>
        <QrScanner
          onResult={(found) => {
            setSerial(found.serial)
            setCode(found.code)
            setMode('form')
          }}
          onUnavailable={(reason) => {
            setCameraNote(t(`claim.camera.${CAMERA_REASONS.includes(reason) ? reason : 'nocamera'}`))
            setMode('form')
          }}
        />
        <button type="button" className="btn btn-secondary" onClick={() => setMode('form')}>
          {t('claim.typeCode')}
        </button>
      </div>
    )
  } else {
    const prefilled = Boolean(initial) && serial === initial.serial && code === initial.code
    body = (
      <form onSubmit={submit} className="form-stack">
        {cameraNote && (
          <p className="login-note" role="status">
            {cameraNote}
          </p>
        )}
        {prefilled && (
          <p className="login-note" role="status">
            {t('claim.prefilled')}
          </p>
        )}
        <label className="form-field">
          <span className="form-label">{t('claim.serial')}</span>
          <input
            className="input"
            type="text"
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="SH-0000"
            required
          />
        </label>
        <label className="form-field">
          <span className="form-label">{t('claim.code')}</span>
          <input
            className="input claim-code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onBlur={() => code && setCode(formatCode(code))}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="XXXX-XXXX-XXXX"
            required
          />
        </label>

        <fieldset className="claim-target">
          <legend className="form-label">{t('claim.where')}</legend>
          <label className={`house-choice-option ${target === 'new' ? 'house-choice-selected' : ''}`}>
            <input
              type="radio"
              name="target"
              className="visually-hidden"
              checked={target === 'new'}
              onChange={() => setTarget('new')}
            />
            <span>{t('claim.newHouse')}</span>
          </label>
          {houses.map((h) => (
            <label key={h.id} className={`house-choice-option ${target === h.id ? 'house-choice-selected' : ''}`}>
              <input
                type="radio"
                name="target"
                className="visually-hidden"
                checked={target === h.id}
                onChange={() => setTarget(h.id)}
              />
              <span>{t('claim.replaces', { house: h.name })}</span>
            </label>
          ))}
        </fieldset>

        {target === 'new' ? (
          <label className="form-field">
            <span className="form-label">{t('houseSheet.houseName')}</span>
            <input className="input" type="text" value={houseName} onChange={(e) => setHouseName(e.target.value)} />
          </label>
        ) : (
          <p className="login-note">{t('claim.replaceNote')}</p>
        )}

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          {/* Zonder camera (cameraNote gezet) heeft scannen geen zin. */}
          {!cameraNote && (
            <button type="button" className="btn btn-plain" onClick={() => setMode('scan')}>
              {t('claim.scan')}
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {t('claim.link')}
          </button>
        </div>
      </form>
    )
  }

  return (
    <Modal title={t('home.addBox')} onClose={close}>
      {body}
    </Modal>
  )
}
