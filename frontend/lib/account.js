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
  // Limieten per IP: aanmelden 10 per uur, mail opnieuw 5 per 10 minuten.
  if (err?.status === 429) return 'Te veel pogingen. Wacht even en probeer het dan opnieuw'
  if (err?.status === 0) return 'Geen verbinding met Sandhovius. Controleer je internet en probeer het opnieuw'
  const data = err?.response?.data
  if (err?.status === 400 && data?.email) return 'Er bestaat al een account met dit e-mailadres'
  return 'Er ging iets mis. Probeer het zo opnieuw'
}

// Waarom een bevestigingslink (/bevestig) mislukte. Alleen 400/404 betekent
// dat de link zelf ongeldig, verlopen of al gebruikt is; bij geen verbinding,
// een serverfout of te veel pogingen (429) werkt dezelfde link straks nog.
export function confirmFailure(err) {
  if (err?.status === 400 || err?.status === 404) return 'invalid'
  if (err?.status === 429) return 'busy'
  return 'offline'
}

// De eisen aan een nieuw wachtwoord, live onder het veld: lang genoeg, en
// twee keer hetzelfde (pas zodra de tweede keer iets bevat).
export function passwordChecks(password, passwordConfirm) {
  return {
    long: (password || '').length >= MIN_PASSWORD_LENGTH,
    same: !!passwordConfirm && password === passwordConfirm,
  }
}
