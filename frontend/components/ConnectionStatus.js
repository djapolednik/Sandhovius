'use client'

import { formatSince } from '../lib/connection'
import { CheckIcon } from '../lib/icons'

// Eerlijk over de verbinding, in huiselijke woorden (PRODUCT.md, "Trust
// through honesty"). Als alles werkt is dit een rustige regel; als iets
// niet bereikbaar is een melding die zegt wat je ziet (de laatst bekende
// stand) en wat er gebeurt. Een stil, gezond huis ziet er nooit uit alsof
// er iets mis is.
//
// realtimeLink: 'connecting' | 'live' | 'lost' — deze telefoon ↔ Sandhovius
// house: { reachable, linked, since } — Sandhovius ↔ de box in huis
export default function ConnectionStatus({ realtimeLink, house, now }) {
  if (realtimeLink === 'lost') {
    return (
      <div className="connection-notice" role="status">
        <strong>Geen verbinding met Sandhovius.</strong> Je ziet de laatst bekende stand van je apparaten. We
        proberen het automatisch opnieuw.
      </div>
    )
  }

  // Bewust ontkoppeld: geen storing, dus niet "reageert niet".
  if (!house.linked) {
    return (
      <div className="connection-notice" role="status">
        <strong>Er is geen box aan dit huis gekoppeld.</strong> Tot er een box gekoppeld is, zie je de laatst
        bekende stand van je apparaten.
      </div>
    )
  }

  if (!house.reachable) {
    return (
      <div className="connection-notice" role="status">
        <strong>
          Je Sandhovius-box reageert niet{house.since ? ` sinds ${formatSince(house.since, now)}` : ''}.
        </strong>{' '}
        Controleer of de box stroom en internet heeft. Tot hij weer reageert zie je de laatst bekende stand.
      </div>
    )
  }

  if (realtimeLink === 'connecting') {
    return (
      <p className="connection-status" role="status">
        Verbinden met je huis…
      </p>
    )
  }

  return (
    <p className="connection-status connection-status-live" role="status">
      <CheckIcon width="14" height="14" aria-hidden="true" />
      Verbonden met je huis
    </p>
  )
}
