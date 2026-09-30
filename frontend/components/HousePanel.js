'use client'

import ConnectionStatus from './ConnectionStatus'
import { WeatherLine } from './Weather'
import { ArrowUpRightIcon, PowerIcon } from '../lib/icons'

// Het huis in één paneel, naast de apparaten: hoe het huis heet, of de box
// bereikbaar is, het weer (op de telefoon; breed staat het in een eigen
// kaart) en wat aandacht nodig heeft. Wat er aan staat zie je aan de
// tegels zelf (Staat aan); hier alleen "Alles uit".
// attention: [{ device, reason }] — wat aandacht nodig heeft (offline,
// batterij bijna leeg, klaarzetten mislukt). Elke regel opent de details
// van dat apparaat.
// onSwitchHouse: alleen met meer dan één huis — naar de keuze in Opties.
// onAllOff: alleen als er iets aan staat en de box bereikbaar is.
export default function HousePanel({
  house,
  realtimeLink,
  houseLink,
  now,
  onAllOff,
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
      {house.weather?.condition && <WeatherLine weather={house.weather} updated={house.weather_updated} now={now} />}
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
      {onAllOff && (
        <button type="button" className="btn btn-secondary house-all-off" onClick={onAllOff}>
          <PowerIcon width="18" height="18" aria-hidden="true" />
          Alles uit
        </button>
      )}
    </section>
  )
}
