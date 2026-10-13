'use client'

import { useIntl } from '../app/LanguageContext'
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
// problemsOnly: alleen iets tonen als er iets mis is (Home). Gezond en
// "verbinden…" staan dan in Opties; een storing blijft op Home zichtbaar.
export default function ConnectionStatus({ realtimeLink, house, now, problemsOnly = false }) {
  const { t, locale } = useIntl()
  const strong = (chunks) => <strong>{chunks}</strong>
  if (realtimeLink === 'lost') {
    return (
      <div className="connection-notice" role="status">
        {t.rich('connection.lost', { strong })}
      </div>
    )
  }

  // Bewust ontkoppeld: geen storing, dus niet "reageert niet".
  if (!house.linked) {
    return (
      <div className="connection-notice" role="status">
        {t.rich('connection.noBox', { strong })}
      </div>
    )
  }

  if (!house.reachable) {
    return (
      <div className="connection-notice" role="status">
        {house.since
          ? t.rich('connection.boxSilentSince', { strong, since: formatSince(house.since, now, locale) })
          : t.rich('connection.boxSilent', { strong })}
      </div>
    )
  }

  if (problemsOnly) return null

  if (realtimeLink === 'connecting') {
    return (
      <p className="connection-status" role="status">
        {t('connection.connecting')}
      </p>
    )
  }

  return (
    <p className="connection-status connection-status-live" role="status">
      <CheckIcon width="14" height="14" aria-hidden="true" />
      {t('connection.live')}
    </p>
  )
}
