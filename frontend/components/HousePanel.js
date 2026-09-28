'use client'

import ConnectionStatus from './ConnectionStatus'
import HouseSummary from './HouseSummary'

// Het huis in één paneel, naast de apparaten: hoe het huis heet, of de box
// bereikbaar is, en wat er nog aan staat. Dit geldt voor het hele huis,
// dus het blijft staan als je van kamer wisselt.
export default function HousePanel({ house, realtimeLink, houseLink, now, summary }) {
  return (
    <section className="panel house-panel" aria-labelledby="house-name">
      <h2 id="house-name" className="house-name">
        {house.name}
      </h2>
      <ConnectionStatus realtimeLink={realtimeLink} house={houseLink} now={now} />
      {summary && (
        <HouseSummary {...summary} />
      )}
    </section>
  )
}
