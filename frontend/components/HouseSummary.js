'use client'

import { ArrowUpRightIcon } from '../lib/icons'

// "1 lamp staat aan", "2 lampen en 1 stopcontact staan aan": zeg wat er
// aan staat, niet alleen hoeveel.
function describeOn(lights, switches) {
  const parts = []
  if (lights) parts.push(`${lights} ${lights === 1 ? 'lamp' : 'lampen'}`)
  if (switches) parts.push(`${switches} ${switches === 1 ? 'stopcontact' : 'stopcontacten'}`)
  return `${parts.join(' en ')} ${lights + switches === 1 ? 'staat' : 'staan'} aan`
}

// Beantwoordt "staat er nog iets aan?" voor het hele huis, zonder elke
// kamer langs te hoeven: per kamer hoeveel lampen/stopcontacten aan staan,
// als knop die meteen naar die kamer springt. Staat alles uit, dan zegt
// hij dat ook — dat is precies wat je 's avonds wilt weten.
//
// rooms: [{ id, label, onCount }] — alleen kamers met iets aan.
// lights/switches: hoeveel lampen en stopcontacten er aan staan.
export default function HouseSummary({ rooms, lights, switches, onSelectRoom }) {
  if (rooms.length === 0) {
    return <p className="house-summary-quiet">Alle lampen en stopcontacten zijn uit.</p>
  }

  // Het eerste getal groot, de rest als zin: "2 lampen en 1 stopcontact".
  const [count, ...rest] = describeOn(lights, switches).split(' ')

  return (
    <div className="house-summary">
      <p className="house-summary-lead">
        <span className="house-summary-count">{count}</span> {rest.join(' ')}
      </p>
      <ul className="house-summary-rooms">
        {rooms.map((room) => (
          <li key={room.id}>
            <button type="button" className="house-summary-room" onClick={() => onSelectRoom(room.id)}>
              <span>{room.label}</span>
              {room.onCount > 1 && <span className="house-summary-room-count">{room.onCount}</span>}
              <ArrowUpRightIcon width="14" height="14" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
