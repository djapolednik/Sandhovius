'use client'

import { useEffect, useRef, useState } from 'react'

// actions: [{ label, onClick }]. Rendered as inline buttons on desktop and
// collapsed behind a hamburger menu on mobile (see the @media rule in
// globals.css) — both are always in the DOM, CSS just decides which shows.
export default function Header({ actions }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  return (
    <header className="header">
      <h1 className="brand">Sandhovius</h1>

      {actions.length > 0 && (
        <div className="nav-desktop">
          {actions.map((action) => (
            <button key={action.label} className="btn btn-secondary" onClick={action.onClick}>
              {action.label}
            </button>
          ))}
        </div>
      )}

      {actions.length > 0 && (
        <div className="nav-mobile" ref={menuRef}>
          <button
            className="btn btn-secondary btn-icon"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <HamburgerIcon />
          </button>
          {menuOpen && (
            <div className="dropdown-menu">
              {actions.map((action) => (
                <button
                  key={action.label}
                  className="dropdown-item"
                  onClick={() => {
                    action.onClick()
                    setMenuOpen(false)
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </header>
  )
}

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 4.5H16M2 9H16M2 13.5H16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
