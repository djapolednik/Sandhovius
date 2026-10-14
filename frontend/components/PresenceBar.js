'use client'

import { useIntl } from '../app/LanguageContext'
import { isHome, othersLine } from '../lib/presence'

// Thuis of weg, op Home onder de groet (spec 2026-10-14-presence-design.md):
// je eigen stand als keuze van twee, en wie er verder thuis is. Een
// instelling, geen apparaat: Electric Blue, niets gloeit. Routines kunnen
// erop reageren, dus ook in een huis met één bewoner.
export default function PresenceBar({ me, members, rows, onChange }) {
  const intl = useIntl()
  const { t } = intl
  const home = isHome(rows, me)
  const line = othersLine(intl, { me, members, rows })
  return (
    <div className="presence-bar">
      <fieldset className="segmented segmented-small presence-choice">
        <legend className="visually-hidden">{t('presence.legend')}</legend>
        {[true, false].map((value) => (
          <label key={String(value)} className={`segmented-option ${home === value ? 'segmented-option-selected' : ''}`}>
            <input
              type="radio"
              name="presence"
              className="visually-hidden"
              checked={home === value}
              onChange={() => onChange(value)}
            />
            {value ? t('presence.home') : t('presence.away')}
          </label>
        ))}
      </fieldset>
      {line && (
        <p className="presence-line" role="status">
          {line}
        </p>
      )}
    </div>
  )
}
