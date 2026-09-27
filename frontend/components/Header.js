'use client'

import RoomTabs from './RoomTabs'
import { useNow } from '../lib/useNow'

const DATE_FORMAT = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })

// "Zaterdag 27 september"
function formatToday(ms) {
  const text = DATE_FORMAT.format(ms)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// De topbalk: vandaag links, de kamers in het midden, je account rechts.
// Op een telefoon schuiven de kamers naar een eigen rij eronder, waar ze
// de volle breedte hebben om te scrollen.
//
// Licht/donker staat alleen in Instellingen (één plek, geen dubbele
// knop), en volgt standaard het thema van de telefoon.
export default function Header({ tabs, selectedId, onSelect, userMenu }) {
  // Eén keer per minuut is genoeg om middernacht niet te missen.
  const now = useNow(60000)

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <p className="topbar-date">{formatToday(now)}</p>
        {tabs.length > 0 && (
          <div className="topbar-rooms">
            <RoomTabs tabs={tabs} selectedId={selectedId} onSelect={onSelect} />
          </div>
        )}
        <div className="topbar-user">{userMenu}</div>
      </div>
    </header>
  )
}
