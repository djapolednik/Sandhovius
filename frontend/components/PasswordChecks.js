'use client'

import { useTranslations } from 'use-intl'
import { MIN_PASSWORD_LENGTH, passwordChecks } from '../lib/account'
import { CheckIcon } from '../lib/icons'

// De eisen aan een nieuw wachtwoord, die meelopen terwijl je typt (in
// "Wachtwoord wijzigen" en op /wachtwoord). id: voor aria-describedby van
// de velden.
export default function PasswordChecks({ id, password, passwordConfirm }) {
  const t = useTranslations('password')
  const checks = passwordChecks(password, passwordConfirm)
  return (
    <ul className="password-checks" id={id}>
      <PasswordCheck met={checks.long}>{t('checkLong', { min: MIN_PASSWORD_LENGTH })}</PasswordCheck>
      <PasswordCheck met={checks.same}>{t('checkSame')}</PasswordCheck>
    </ul>
  )
}

// Een eis: een lege ring, of een vinkje als hij klopt. Geen groen: dat is
// voor apparaten die aan staan (The State Means State Rule); het vinkje en
// de donkerder tekst zeggen het.
function PasswordCheck({ met, children }) {
  const t = useTranslations('password')
  return (
    <li className={met ? 'password-check-met' : undefined}>
      <span className="password-check-mark" aria-hidden="true">
        {met && <CheckIcon width="14" height="14" />}
      </span>
      {children}
      <span className="visually-hidden">{met ? t('checkMet') : t('checkNotMet')}</span>
    </li>
  )
}
