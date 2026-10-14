'use client'

import { useState } from 'react'
import { useTranslations } from 'use-intl'
import Modal from './Modal'
import { DropIcon, LightbulbIcon, PowerIcon, ShieldIcon, ThermometerIcon } from '../lib/icons'

const ICONS = { light: LightbulbIcon, climate: ThermometerIcon, security: ShieldIcon, water: DropIcon }

// De categorieën op Home (roadmap E1): een rij knoppen met de stand erin
// ("Licht · 2 aan", "Water · Droog"). Een tik opent een sheet met alle
// apparaten van die soort, per kamer; bij Licht met "Licht uit". Een knop
// gloeit nooit (een overzicht is geen licht dat aan staat); een alarm (lek,
// rook) is Amber, met het woord erbij (State Means State).
//
// categories: categorySummary (lib/categories.js). renderByRoom: de
// tegels per kamer, zoals op Home. onLightsOff: de lampen die aan staan uit.
export default function HomeCategories({ categories, renderByRoom, canSwitch, onLightsOff }) {
  const t = useTranslations()
  const [openKey, setOpenKey] = useState(null)
  const open = categories.find((c) => c.key === openKey)
  const lightsOn = open?.key === 'light' ? open.devices.filter((d) => d.expand?.device_state_via_device?.[0]?.state?.state === 'on') : []

  return (
    <nav className="home-categories" aria-label={t('categories.nav')}>
      <ul className="category-strip">
        {categories.map((c) => {
          const Icon = ICONS[c.key]
          return (
            <li key={c.key}>
              <button
                type="button"
                className={`category-pill ${c.alert ? 'category-pill-alert' : ''}`}
                onClick={() => setOpenKey(c.key)}
              >
                <span className="category-pill-icon" aria-hidden="true">
                  <Icon width="18" height="18" />
                </span>
                <span className="category-pill-text">
                  <span className="category-pill-label">{c.label}</span>
                  {c.state && <span className="category-pill-state">{c.state}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {open && (
        <Modal title={open.label} onClose={() => setOpenKey(null)}>
          {lightsOn.length > 0 && canSwitch && (
            <button
              type="button"
              className="btn btn-secondary category-lights-off"
              onClick={() => {
                onLightsOff(lightsOn)
                setOpenKey(null)
              }}
            >
              <PowerIcon width="18" height="18" aria-hidden="true" />
              {t('categories.lightsOff')}
            </button>
          )}
          {renderByRoom(open.devices)}
        </Modal>
      )}
    </nav>
  )
}
