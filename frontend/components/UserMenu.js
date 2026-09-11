'use client'

import { useEffect, useRef, useState } from 'react'
import { UserIcon } from '../lib/icons'

// Ronde avatar rechtsboven. avatarUrl is er nu nog niet (geen profielfoto-
// upload gebouwd) — valt terug op een user-icoon.
export default function UserMenu({ avatarUrl, onChangeHouse, onOpenSettings, onLogout }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function pick(action) {
    setOpen(false)
    action()
  }

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="avatar-button"
        aria-label="Gebruikersmenu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="avatar-image" />
        ) : (
          <UserIcon />
        )}
      </button>

      {open && (
        <div className="dropdown-menu">
          <button className="dropdown-item" onClick={() => pick(onChangeHouse)}>
            Huis wijzigen
          </button>
          <button className="dropdown-item" onClick={() => pick(onOpenSettings)}>
            Instellingen
          </button>
          <button className="dropdown-item" onClick={() => pick(onLogout)}>
            Uitloggen
          </button>
        </div>
      )}
    </div>
  )
}
