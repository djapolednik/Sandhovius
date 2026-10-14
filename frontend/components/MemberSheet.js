'use client'

import { useTranslations } from 'use-intl'
import { useState } from 'react'
import Modal from './Modal'
import RoleChoice from './RoleChoice'
import { householdError } from '../lib/household'

// Eén lid van het huis, voor een beheerder: rol wijzigen (slaat zichzelf op,
// zoals de detail-sheet) en uit het huis verwijderen, met bevestiging. De
// server bewaakt dat er altijd een beheerder overblijft; die melding staat
// dan hier.
export default function MemberSheet({ member, houseName, isSelf, onChangeRole, onSetCanEdit, onRemove, onClose }) {
  const t = useTranslations()
  const [role, setRole] = useState(member.role)
  // D1: mag automatiseringen en apparaten wijzigen. Een beheerder altijd.
  const [canEdit, setCanEdit] = useState(member.can_edit !== false)
  const [busy, setBusy] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [error, setError] = useState('')
  const name = member.name || member.email

  async function chooseRole(value) {
    const previous = role
    setRole(value)
    setBusy(true)
    setError('')
    try {
      await onChangeRole(member.id, value)
    } catch (err) {
      setRole(previous)
      setError(householdError(t, t('errors.what.changeRole'), err))
    } finally {
      setBusy(false)
    }
  }

  async function toggleCanEdit() {
    const next = !canEdit
    setCanEdit(next)
    setBusy(true)
    setError('')
    try {
      await onSetCanEdit(member.id, next)
    } catch (err) {
      setCanEdit(!next)
      setError(householdError(t, t('errors.what.rights'), err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    setBusy(true)
    setError('')
    try {
      await onRemove(member.id)
      onClose()
    } catch (err) {
      setError(householdError(t, t(isSelf ? 'errors.what.leaveHouse' : 'errors.what.delete'), err))
      setBusy(false)
    }
  }

  return (
    <Modal title={name} onClose={onClose}>
      {member.name && <p className="member-sheet-email">{member.email}</p>}
      <div className="form-field">
        <span className="form-label">{t('household.role')}</span>
        <RoleChoice value={role} onChange={chooseRole} name={`role-${member.id}`} disabled={busy} />
      </div>

      {role === 'admin' ? (
        <p className="settings-hint rights-text">{t('rights.admin')}</p>
      ) : (
        <div className="rights">
          <div className="settings-row">
            <span id={`can-edit-${member.id}`}>{t('rights.canEdit')}</span>
            <button
              type="button"
              role="switch"
              aria-checked={canEdit}
              aria-labelledby={`can-edit-${member.id}`}
              className={`switch switch-accent ${canEdit ? 'switch-on' : ''}`}
              disabled={busy}
              onClick={toggleCanEdit}
            >
              <span className="switch-thumb" />
            </button>
          </div>
          <p className="settings-hint rights-text">{t('rights.always')}</p>
          <p className="settings-hint rights-text">{canEdit ? t('rights.edits') : t('rights.noEdits')}</p>
        </div>
      )}

      <div className="modal-divider" />

      {confirmingRemove ? (
        <div className="room-confirm">
          <p className="room-confirm-text">
            {isSelf
              ? t('household.confirmLeave', { house: houseName })
              : t('household.confirmRemove', { name, house: houseName })}
          </p>
          <div className="room-row-actions">
            <button className="btn btn-plain" onClick={() => setConfirmingRemove(false)} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-danger-text" onClick={handleRemove} disabled={busy}>
              {isSelf ? t('household.leave') : t('common.delete')}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button className="btn btn-danger-text" onClick={() => setConfirmingRemove(true)}>
            {isSelf ? t('household.leave') : t('household.remove')}
          </button>
        </div>
      )}

      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
    </Modal>
  )
}
