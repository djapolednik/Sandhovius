'use client'

import { GearIcon, HomeIcon, PlusIcon, RoomsIcon } from '../lib/icons'

export const TABS = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'kamers', label: 'Kamers', Icon: RoomsIcon },
  // Zacht afbreekstreepje: bij grote tekst breekt het woord netjes af
  // ("Instel-lingen") in plaats van uit de balk te lopen.
  { id: 'instellingen', label: 'Instel\u00ADlingen', Icon: GearIcon },
]

// De hoofdnavigatie onderin, binnen bereik van je duim — de app wordt
// vooral op een telefoon of iPad gebruikt. Icoon én woord: wie niet elke
// dag met apps werkt hoeft niet te raden wat een icoon betekent.
//
// Tussen Kamers en Instellingen: een rond "+" om een apparaat toe te
// voegen, vanaf elk tabblad. Het is een actie, geen tabblad: een rustige
// cirkel met een blauw plusje, zodat het actieve tabblad het enige blauwe
// vlak blijft. onAdd ontbreekt zolang er geen huis is.
export default function BottomNav({ activeTab, onSelect, onAdd }) {
  return (
    <nav className="bottom-nav" aria-label="Hoofdmenu">
      <ul className={`bottom-nav-list ${onAdd ? 'bottom-nav-list-add' : ''}`}>
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id
          return (
            <li key={id} className={id === 'instellingen' && onAdd ? 'bottom-nav-after-add' : undefined}>
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
        })}
        {onAdd && (
          <li className="bottom-nav-add">
            <button type="button" className="bottom-nav-add-button" aria-label="Apparaat toevoegen" onClick={onAdd}>
              <PlusIcon width="26" height="26" aria-hidden="true" />
            </button>
          </li>
        )}
      </ul>
    </nav>
  )
}
