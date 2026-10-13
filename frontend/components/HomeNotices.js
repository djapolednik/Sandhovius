'use client'

import { useState } from 'react'
import { useIntl } from '../app/LanguageContext'
import ConnectionStatus from './ConnectionStatus'
import Modal from './Modal'
import { ArrowUpRightIcon, ChevronRightIcon } from '../lib/icons'
import { attentionLine, attentionReason } from '../lib/home'

// Bovenaan Home, alleen als er iets is. Een storing in de verbinding (de
// box reageert niet, geen verbinding, geen box gekoppeld) staat er voluit:
// die verandert wat elke tegel betekent. "Let op" (een apparaat offline,
// een batterij bijna leeg, klaarzetten mislukt) is één regel die een sheet
// opent met de lijst. Een gezond huis laat hier niets zien; "Verbonden met
// je huis" staat in Opties.
// attention: [{ device, kind, battery }], het zwaarste eerst (sortAttention);
// elke regel in de sheet opent de details van dat apparaat.
export default function HomeNotices({ realtimeLink, houseLink, now, attention = [], onOpenDevice }) {
  // Hier en niet in page.js: is de lijst leeg, dan verdwijnt dit hele blok
  // en gaat de sheet vanzelf dicht, ook bij een volgende melding.
  const intl = useIntl()
  const { t } = intl
  const [open, setOpen] = useState(false)
  const connectionProblem = realtimeLink === 'lost' || !houseLink.linked || !houseLink.reachable
  if (!connectionProblem && attention.length === 0) return null
  return (
    <section className="home-notices" aria-label={t('home.attention.notices')}>
      <ConnectionStatus realtimeLink={realtimeLink} house={houseLink} now={now} problemsOnly />
      {attention.length > 0 && (
        <button type="button" className="home-attention" onClick={() => setOpen(true)}>
          <span className="home-attention-dot" aria-hidden="true" />
          <span className="home-attention-text">{attentionLine(intl, attention)}</span>
          <ChevronRightIcon width="16" height="16" aria-hidden="true" />
        </button>
      )}
      {/* Ook als er nog een storing staat: zonder lijst geen lege sheet. */}
      {open && attention.length > 0 && (
        <Modal title={t('home.attention.title')} onClose={() => setOpen(false)}>
          <ul className="attention-list">
            {attention.map((item) => (
              <li key={item.device.id}>
                <button
                  type="button"
                  className="attention-item"
                  onClick={() => {
                    setOpen(false)
                    onOpenDevice(item.device)
                  }}
                >
                  <span className="attention-item-text">
                    <span className="attention-item-name">{item.device.name}</span>
                    <span className="attention-item-reason">{attentionReason(intl, item)}</span>
                  </span>
                  <ArrowUpRightIcon width="16" height="16" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </section>
  )
}
