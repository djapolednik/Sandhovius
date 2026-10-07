'use client'

import { ChevronRightIcon, LightbulbIcon, PlugIcon, RoomsIcon } from '../lib/icons'

// rooms: [{ id, label, devices, switchable, on }] — switchable zijn de
// lampen en stopcontacten die de box kan schakelen (online en klaargezet),
// on daarvan wat nu aan staat (zie page.js).

// "2 van 3 aan", "Alles uit": hoe de kamer erbij staat, in woorden naast
// de schakelaar (State Means State: nooit alleen de kleur).
export function describeRoom(room, reachable) {
  if (room.devices.length === 0) return 'Nog leeg'
  if (room.switchable.length === 0) return room.devices.length === 1 ? '1 apparaat' : `${room.devices.length} apparaten`
  if (!reachable) return 'Niet bereikbaar'
  const on = room.on.length
  const all = room.switchable.length
  if (on === 0) return 'Alles uit'
  if (on === all) return all === 1 ? 'Aan' : 'Alles aan'
  return `${on} van ${all} aan`
}

// Eén schakelaar voor de hele kamer: staat er iets aan, dan gaat alles uit;
// anders gaat alles aan. Apparaatstand, dus Signal Green.
export function RoomSwitch({ room, canSwitch, onSwitch }) {
  if (room.switchable.length === 0) return null
  const isOn = room.on.length > 0
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label={`Lampen en stopcontacten in ${room.label}`}
      aria-disabled={canSwitch ? undefined : true}
      className={`switch room-switch ${isOn ? 'switch-on' : ''}`}
      onClick={() => canSwitch && onSwitch(room)}
    >
      <span className="switch-thumb" />
    </button>
  )
}

// Het icoon zegt wat er in de kamer brandt: het lampje licht amber op als
// er een lamp aan is, stroomblauw als alleen een stopcontact aan is. Geen
// gloed: de tegels zelf geven het licht.
function RoomIcon({ room, reachable }) {
  const lampOn = reachable && room.on.some((device) => device.type === 'light')
  const plugOn = reachable && !lampOn && room.on.length > 0
  const Icon = plugOn ? PlugIcon : room.switchable.length > 0 ? LightbulbIcon : RoomsIcon
  return (
    <span
      className={`device-icon room-item-icon ${lampOn ? 'room-item-icon-lamp' : plugOn ? 'room-item-icon-power' : ''}`}
      aria-hidden="true"
    >
      <Icon width="22" height="22" />
    </span>
  )
}

// Kamers op een breed scherm: alle kamers onder elkaar, elk met een
// schakelaar. Een tik op de kamer toont zijn apparaten ernaast; de
// schakelaar bedient de hele kamer zonder dat je hem hoeft te openen. Op
// een telefoon staan hier de kamerpillen (zie RoomTabs).
export default function RoomsPanel({ rooms, selectedId, onSelect, reachable, onSwitch }) {
  return (
    <nav className="panel rooms-panel" aria-label="Kamers">
      <ul className="rooms-panel-list">
        {rooms.map((room) => {
          const selected = room.id === selectedId
          return (
            <li key={room.id} className={`room-item ${selected ? 'room-item-selected' : ''}`}>
              <button
                type="button"
                className="room-item-main"
                aria-current={selected ? 'true' : undefined}
                onClick={() => onSelect(room.id)}
              >
                <RoomIcon room={room} reachable={reachable} />
                <span className="room-item-text">
                  <span className="room-item-name">{room.label}</span>
                  <span className="room-item-meta">{describeRoom(room, reachable)}</span>
                </span>
                {/* Zegt dat de rij zelf een knop is, los van de schakelaar. */}
                <ChevronRightIcon className="room-item-chevron" width="18" height="18" aria-hidden="true" />
              </button>
              <RoomSwitch room={room} canSwitch={reachable} onSwitch={onSwitch} />
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
