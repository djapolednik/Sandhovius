'use client'

import { useEffect, useRef } from 'react'
import { useScrollEdges } from '../lib/useScrollEdges'

// tabs: [{ id, label }]. Een strook die horizontaal scrolt als er meer
// kamers zijn dan er passen; een zachte vervaging aan de rand laat zien
// dát er meer is (de scrollbalk zelf is verborgen). De gekozen kamer
// schuift vanzelf in beeld, ook als je hem via de samenvatting kiest.
//
// aria-current i.p.v. het volledige tablist-patroon: dit zijn gewone
// knoppen die een filter kiezen, en zo hoort een schermlezer toch welke
// kamer nu actief is.
export default function RoomTabs({ tabs, selectedId, onSelect }) {
  const stripRef = useRef(null)
  const edges = useScrollEdges(stripRef, tabs.length)

  useEffect(() => {
    const active = stripRef.current?.querySelector('[aria-current="true"]')
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selectedId])

  return (
    <nav
      ref={stripRef}
      className={`room-tabs ${edges}`}
      aria-label="Kamers"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`room-tab ${selectedId === tab.id ? 'room-tab-active' : ''}`}
          aria-current={selectedId === tab.id ? 'true' : undefined}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
