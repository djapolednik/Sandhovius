'use client'

import { GearIcon, HomeIcon, RoomsIcon } from '../lib/icons'

export const TABS = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'kamers', label: 'Kamers', Icon: RoomsIcon },
  { id: 'instellingen', label: 'Instellingen', Icon: GearIcon },
]

// De hoofdnavigatie onderin, binnen bereik van je duim — de app wordt
// vooral op een telefoon of iPad gebruikt. Icoon én woord: wie niet elke
// dag met apps werkt hoeft niet te raden wat een icoon betekent.
export default function BottomNav({ activeTab, onSelect }) {
  return (
    <nav className="bottom-nav" aria-label="Hoofdmenu">
      <ul className="bottom-nav-list">
        {TABS.map(({ id, label, Icon }) => {
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
        })}
      </ul>
    </nav>
  )
}
