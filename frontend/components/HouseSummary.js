'use client'

// Beantwoordt "staat er nog iets aan?" voor het hele huis, zonder elke
// kamer langs te hoeven: per kamer hoeveel lampen/stopcontacten aan staan,
// als knop die meteen naar die kamer springt. Staat alles uit, dan zegt
// hij dat ook — dat is precies wat je 's avonds wilt weten.
//
// rooms: [{ id, label, onCount }] — alleen kamers met iets aan.
export default function HouseSummary({ rooms, onSelectRoom }) {
  if (rooms.length === 0) {
    return <p className="house-summary">Alle lampen en stopcontacten zijn uit.</p>
  }

  const total = rooms.reduce((sum, room) => sum + room.onCount, 0)

  return (
    <div className="house-summary">
      <span className="house-summary-lead">{total} aan in</span>
      <ul className="house-summary-rooms">
        {rooms.map((room) => (
          <li key={room.id}>
            <button type="button" className="house-summary-room" onClick={() => onSelectRoom(room.id)}>
              {room.label}
              {room.onCount > 1 && <span className="house-summary-count"> · {room.onCount}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
