'use client'

import { useTranslations } from 'use-intl'
import { ChevronDownIcon, ChevronUpIcon } from '../lib/icons'

// Omhoog/omlaag in een lijst (kamers, favorieten). Knoppen i.p.v. slepen:
// werkt met één duim, met het toetsenbord en met een schermlezer, en
// niemand hoeft te ontdekken dát je kunt slepen.
export default function MoveButtons({ label, index, count, onMove }) {
  const t = useTranslations('common')
  return (
    <span className="move-buttons">
      <button
        type="button"
        className="btn btn-icon btn-plain"
        aria-label={t('moveUp', { label })}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <ChevronUpIcon />
      </button>
      <button
        type="button"
        className="btn btn-icon btn-plain"
        aria-label={t('moveDown', { label })}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        <ChevronDownIcon />
      </button>
    </span>
  )
}
