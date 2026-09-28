'use client'

import { GearIcon, HomeIcon, PlusIcon, RoomsIcon, ScenesIcon } from '../lib/icons'

export const TABS = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'kamers', label: 'Kamers', Icon: RoomsIcon },
  { id: 'scenes', label: 'Scènes', Icon: ScenesIcon },
  // "Opties": past op één regel in de balk met vijf plekken. De hash
  // blijft #instellingen, zodat bestaande links en de terugknop werken.
  { id: 'instellingen', label: 'Opties', Icon: GearIcon },
]

// De hoofdnavigatie onderin, binnen bereik van je duim — de app wordt
// vooral op een telefoon of iPad gebruikt. Icoon én woord: wie niet elke
// dag met apps werkt hoeft niet te raden wat een icoon betekent.
//
// Precies in het midden: een los, rond "+" om een apparaat toe te voegen,
// vanaf elk tabblad. De balk loopt eromheen (een ring in de kleur van de
// balk). Het is een actie, geen tabblad: een rustige cirkel met een blauw
// plusje, zodat het actieve tabblad het enige blauwe vlak blijft. onAdd
// ontbreekt zolang er geen huis is.
export default function BottomNav({ activeTab, onSelect, onAdd }) {
  const tab = ({ id, label, Icon }) => {
    const isActive = activeTab === id
    return (
      <li key={id}>
        <button
          type="button"
          className={`bottom-nav-item ${isActive ? 'bottom-nav-item-active' : ''}`}
          aria-current={isActive ? 'page' : undefined}
          onClick={() => onSelect(id)}
        >
          <Icon width="22" height="22" aria-hidden="true" />
          <span>{label}</span>
        </button>
      </li>
    )
  }

  return (
    <nav className="bottom-nav" aria-label="Hoofdmenu">
      <ul className={`bottom-nav-list ${onAdd ? 'bottom-nav-list-add' : ''}`}>
        {TABS.slice(0, 2).map(tab)}
        {onAdd && (
          <li className="bottom-nav-add">
            <button type="button" className="bottom-nav-add-button" aria-label="Apparaat toevoegen" onClick={onAdd}>
              <PlusIcon width="28" height="28" aria-hidden="true" />
            </button>
          </li>
        )}
        {TABS.slice(2).map(tab)}
      </ul>
    </nav>
  )
}
