// Helpers voor account aanmaken, bevestigen en wachtwoord resetten.

export const MIN_PASSWORD_LENGTH = 8 // zoals PocketBase

// De taal van de mails: de eerste browsertaal die nl of en is, anders nl.
export function defaultLanguage(navigatorLanguages) {
  for (const tag of navigatorLanguages || []) {
    const base = String(tag).toLowerCase().split('-')[0]
    if (base === 'nl' || base === 'en') return base
  }
  return 'nl'
}

// Nederlandse foutmelding, of null als het formulier klopt.
export function validateSignup({ email, password, passwordConfirm }) {
  if (!email || !email.trim()) return 'Vul je e-mailadres in'
  if ((password || '').length < MIN_PASSWORD_LENGTH) {
    return `Kies een wachtwoord van minstens ${MIN_PASSWORD_LENGTH} tekens`
  }
  if (password !== passwordConfirm) return 'De twee wachtwoorden zijn niet gelijk'
  return null
}

// PocketBase-fout naar tekst voor het scherm. De ruwe melding is Engels
// en technisch; die blijft in de console.
export function errorMessage(err) {
  if (err?.status === 429) return 'Te veel pogingen, probeer het over een minuut opnieuw'
  if (err?.status === 0) return 'Geen verbinding met Sandhovius. Controleer je internet en probeer het opnieuw'
  const data = err?.response?.data
  if (err?.status === 400 && data?.email) return 'Er bestaat al een account met dit e-mailadres'
  return 'Er ging iets mis. Probeer het zo opnieuw'
}
