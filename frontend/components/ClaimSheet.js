'use client'

import { useEffect, useState } from 'react'
import Modal from './Modal'
import QrScanner from './QrScanner'
import VerifyNotice from './VerifyNotice'
import { claimErrorMessage, formatCode, isBoxOnline, pendingKey } from '../lib/claim'

const CAMERA_REASON = {
  insecure: 'De camera werkt alleen op een beveiligde verbinding. Tik de code over van het blad bij je box.',
  denied: 'Je hebt de camera niet toegestaan. Tik de code over van het blad bij je box.',
  nocamera: 'Er is geen camera gevonden. Tik de code over van het blad bij je box.',
}

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
  const [verified, setVerified] = useState(Boolean(user?.verified))
  const [mode, setMode] = useState(initial ? 'form' : 'scan') // scan | form
  const [cameraNote, setCameraNote] = useState('')
  const [serial, setSerial] = useState(initial?.serial ?? '')
  const [code, setCode] = useState(initial?.code ?? '')
  const [target, setTarget] = useState('new') // 'new' of een huis-id
  const [houseName, setHouseName] = useState('Thuis')
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
    setBusy(true)
    setError('')
    const body = { serial: serial.trim(), code }
    if (target === 'new') body.house_name = houseName.trim() || 'Thuis'
    else body.replace_house = target
    try {
      const res = await pb.send('/api/sandhovius/claim', { method: 'POST', body })
      clearPending()
      const house = await pb.collection('houses').getOne(res.house)
      setClaimed({ houseId: res.house, claimedAt: house.claimed_at })
      await onClaimed(res.house)
    } catch (err) {
      console.error('[koppelen]', err?.status)
      if (err?.status === 403) setVerified(false)
      setError(claimErrorMessage(err?.status ?? 0, err?.message))
    } finally {
      setBusy(false)
    }
  }

  let body
  if (claimed) {
    body = online ? (
      <p className="login-note" role="status">
        Je box is gekoppeld en meldt zich. Je huis staat klaar.
      </p>
    ) : (
      <div className="form-stack">
        <p className="claim-wait" role="status">
          <span className="claim-pulse" aria-hidden="true" />
          Wachten tot je box zich meldt…
        </p>
        <p className="login-note">
          Zet je box aan en sluit hem aan op internet. Dit duurt meestal een minuut. Je kunt dit venster sluiten; je
          huis is al gekoppeld.
        </p>
        <button type="button" className="btn btn-secondary" onClick={close}>
          Sluiten
        </button>
      </div>
    )
  } else if (!verified) {
    body = (
      <VerifyNotice email={user?.email} onResend={() => pb.collection('users').requestVerification(user.email)}>
        <p className="login-note">
          Je box-code bewaren we zolang dit venster open staat. Zodra je e-mailadres bevestigd is, ga je hier verder.
        </p>
      </VerifyNotice>
    )
  } else if (mode === 'scan') {
    body = (
      <div className="form-stack">
        <p className="login-note">Richt de camera op de QR-code op het blad bij je box.</p>
        <QrScanner
          onResult={(found) => {
            setSerial(found.serial)
            setCode(found.code)
            setMode('form')
          }}
          onUnavailable={(reason) => {
            setCameraNote(CAMERA_REASON[reason] || CAMERA_REASON.nocamera)
            setMode('form')
          }}
        />
        <button type="button" className="btn btn-secondary" onClick={() => setMode('form')}>
          Code overtikken
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
            We hebben de gegevens van je box ingevuld.
          </p>
        )}
        <label className="form-field">
          <span className="form-label">Serienummer</span>
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
          <span className="form-label">Code</span>
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
          <legend className="form-label">Waar hoort deze box?</legend>
          <label className={`house-choice-option ${target === 'new' ? 'house-choice-selected' : ''}`}>
            <input
              type="radio"
              name="target"
              className="visually-hidden"
              checked={target === 'new'}
              onChange={() => setTarget('new')}
            />
            <span>Nieuw huis</span>
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
              <span>Vervangt de box van {h.name}</span>
            </label>
          ))}
        </fieldset>

        {target === 'new' ? (
          <label className="form-field">
            <span className="form-label">Naam van je huis</span>
            <input className="input" type="text" value={houseName} onChange={(e) => setHouseName(e.target.value)} />
          </label>
        ) : (
          <p className="login-note">Je kamers, apparaten en scènes blijven bewaard; de nieuwe box neemt het over.</p>
        )}

        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn-plain" onClick={() => setMode('scan')}>
            Scan de QR-code
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Box koppelen
          </button>
        </div>
      </form>
    )
  }

  return (
    <Modal title="Box toevoegen" onClose={close}>
      {body}
    </Modal>
  )
}
