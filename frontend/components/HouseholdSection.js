'use client'

import { useTranslations } from 'use-intl'
import { useEffect, useState } from 'react'
import InviteSheet from './InviteSheet'
import MemberSheet from './MemberSheet'
import { expiresText, householdError, roleLabel } from '../lib/household'
import { ChevronRightIcon } from '../lib/icons'

// Opties → Huisgenoten: wie er in dit huis zit, met welke rol, en wie er
// uitgenodigd is. Een beheerder nodigt uit, wijzigt rollen en haalt mensen
// weg; een huisgenoot ziet de lijst en kan het huis verlaten.
//
// De leden komen van /api/sandhovius/houses/{id}/members (namen en
// e-mailadressen van anderen zijn niet rechtstreeks leesbaar). Opnieuw
// laden zodra members of admins van het huis veranderen (realtime).
export default function HouseholdSection({
  house,
  userId,
  admin,
  invitations,
  loadMembers,
  onInvite,
  onChangeRole,
  onRemove,
  onRevoke,
}) {
  const t = useTranslations()
  const [members, setMembers] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [inviting, setInviting] = useState(false)
  const [openMember, setOpenMember] = useState(null)
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const membership = `${house.id}:${(house.members ?? []).join(',')}:${(house.admins ?? []).join(',')}`

  useEffect(() => {
    let cancelled = false
    loadMembers()
      .then((res) => {
        if (cancelled) return
        setMembers(res.items)
        setLoadError('')
      })
      .catch((err) => {
        if (!cancelled) setLoadError(householdError(t, t('errors.what.loadMembers'), err))
      })
    return () => {
      cancelled = true
    }
    // loadMembers is per render nieuw; membership zegt wanneer het echt moet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membership])

  async function leave() {
    setBusy(true)
    setError('')
    try {
      await onRemove(userId)
    } catch (err) {
      setError(householdError(t, t('errors.what.leaveHouse'), err))
      setBusy(false)
    }
  }

  async function revoke(invitation) {
    setError('')
    try {
      await onRevoke(invitation.id)
    } catch (err) {
      setError(householdError(t, t('errors.what.revoke'), err))
    }
  }

  const memberText = (m) => (m.id === userId ? t('household.you', { role: roleLabel(t, m.role) }) : roleLabel(t, m.role))

  return (
    <section className="panel settings-section" aria-labelledby="settings-household">
      <h2 id="settings-household" className="settings-heading">
        Huisgenoten
      </h2>

      {loadError && <p className="error-banner">{loadError}</p>}
      {!members && !loadError && <p className="settings-hint">Even laden…</p>}

      {members && (
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.id}>
              {admin ? (
                <button type="button" className="settings-link member-row" onClick={() => setOpenMember(m)}>
                  <span className="settings-link-text">
                    <span className="member-name">{m.name || m.email}</span>
                    <span className="settings-link-sub">{memberText(m)}</span>
                  </span>
                  <ChevronRightIcon className="settings-link-arrow" width="18" height="18" aria-hidden="true" />
                </button>
              ) : (
                <div className="member-row member-row-static">
                  <span className="settings-link-text">
                    <span className="member-name">{m.name || m.email}</span>
                    <span className="settings-link-sub">{memberText(m)}</span>
                  </span>
                </div>
              )}
            </li>
          ))}
          {invitations.map((inv) => (
            <li key={inv.id} className="member-row member-row-static member-row-invited">
              <span className="settings-link-text">
                <span className="member-name">{inv.email}</span>
                <span className="settings-link-sub">
                  {t('household.invitedAs', { role: inv.role, expires: expiresText(t, inv.expires) })}
                </span>
              </span>
              {admin && (
                <button
                  type="button"
                  className="btn btn-plain member-revoke"
                  aria-label={`Uitnodiging voor ${inv.email} intrekken`}
                  onClick={() => revoke(inv)}
                >
                  Intrekken
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {admin && (
        <button type="button" className="btn btn-secondary settings-add-box" onClick={() => setInviting(true)}>
          Iemand uitnodigen
        </button>
      )}

      {!admin &&
        members &&
        (confirmingLeave ? (
          <div className="room-confirm member-leave">
            <p className="room-confirm-text">Huis verlaten? Je verliest de toegang tot {house.name}.</p>
            <div className="room-row-actions">
              <button className="btn btn-plain" onClick={() => setConfirmingLeave(false)} disabled={busy}>
                Annuleren
              </button>
              <button className="btn btn-danger-text" onClick={leave} disabled={busy}>
                Huis verlaten
              </button>
            </div>
          </div>
        ) : (
          <div className="member-leave">
            <button className="btn btn-danger-text" onClick={() => setConfirmingLeave(true)}>
              Huis verlaten
            </button>
          </div>
        ))}

      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}

      {inviting && <InviteSheet houseName={house.name} onInvite={onInvite} onClose={() => setInviting(false)} />}
      {openMember && (
        <MemberSheet
          key={openMember.id}
          member={openMember}
          houseName={house.name}
          isSelf={openMember.id === userId}
          onChangeRole={onChangeRole}
          onRemove={onRemove}
          onClose={() => setOpenMember(null)}
        />
      )}
    </section>
  )
}
