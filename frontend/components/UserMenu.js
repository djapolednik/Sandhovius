'use client'

import { useEffect, useRef, useState } from 'react'
import { UserIcon } from '../lib/icons'

// Ronde avatar rechtsboven. avatarUrl is er nu nog niet (geen profielfoto-
// upload gebouwd) — valt terug op een user-icoon.
export default function UserMenu({ avatarUrl, onChangeHouse, onOpenSettings, onLogout }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    // Escape sluit het menu en zet de focus terug op de avatar, zodat een
    // toetsenbordgebruiker niet "kwijt" is.
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  // Focus eerst terug naar de avatar: het menu-item verdwijnt zo meteen,
  // en een modal die hierna opent onthoudt het actieve element om de
  // focus bij sluiten naar terug te zetten.
  function pick(action) {
    setOpen(false)
    buttonRef.current?.focus()
    action()
  }

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        ref={buttonRef}
        className="avatar-button"
        aria-label="Gebruikersmenu"
        aria-haspopup="true"
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
            Huis en kamers
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
