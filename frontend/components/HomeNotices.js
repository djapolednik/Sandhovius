'use client'

import ConnectionStatus from './ConnectionStatus'
import { ArrowUpRightIcon } from '../lib/icons'

// Bovenaan Home, alleen als er iets is: een storing in de verbinding (de box
// reageert niet, geen verbinding, geen box gekoppeld) en "Let op" (een
// apparaat offline, een batterij bijna leeg, klaarzetten mislukt). Een
// gezond huis laat hier niets zien; "Verbonden met je huis" staat in Opties.
// attention: [{ device, reason }]; elke regel opent de details van dat apparaat.
export default function HomeNotices({ realtimeLink, houseLink, now, attention = [], onOpenDevice }) {
  const connectionProblem = realtimeLink === 'lost' || !houseLink.linked || !houseLink.reachable
  if (!connectionProblem && attention.length === 0) return null
  return (
    <section className="panel home-notices" aria-label="Meldingen">
      <ConnectionStatus realtimeLink={realtimeLink} house={houseLink} now={now} problemsOnly />
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
    </section>
  )
}
