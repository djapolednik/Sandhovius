'use client'

import ConnectionStatus from './ConnectionStatus'
import HouseSummary from './HouseSummary'
import { ArrowUpRightIcon } from '../lib/icons'

// Het huis in één paneel, naast de apparaten: hoe het huis heet, of de box
// bereikbaar is, en wat er nog aan staat. Dit geldt voor het hele huis,
// dus het blijft staan als je van kamer wisselt.
// attention: [{ device, reason }] — wat aandacht nodig heeft (offline,
// batterij bijna leeg, klaarzetten mislukt). Elke regel opent de details
// van dat apparaat.
// onSwitchHouse: alleen met meer dan één huis — naar de keuze in Opties.
export default function HousePanel({
  house,
  realtimeLink,
  houseLink,
  now,
  summary,
  attention = [],
  onOpenDevice,
  onSwitchHouse,
}) {
  return (
    <section className="panel house-panel" aria-labelledby="house-name">
      <h2 id="house-name" className="house-name">
        {house.name}
      </h2>
      {onSwitchHouse && (
        <button type="button" className="btn btn-plain section-action house-switch" onClick={onSwitchHouse}>
          Ander huis
        </button>
      )}
      <ConnectionStatus realtimeLink={realtimeLink} house={houseLink} now={now} />
      {attention.length > 0 && (
        <div className="house-attention">
          <p className="house-attention-lead">Let op</p>
          <ul className="house-attention-list">
            {attention.map(({ device, reason }) => (
              <li key={device.id}>
                <button type="button" className="house-attention-item" onClick={() => onOpenDevice(device)}>
                  <span>
                    {device.name}: {reason}
                  </span>
                  <ArrowUpRightIcon width="14" height="14" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {summary && (
        <HouseSummary {...summary} />
      )}
    </section>
  )
}
