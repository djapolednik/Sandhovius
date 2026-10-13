// Helpers voor account aanmaken, bevestigen en wachtwoord resetten.

export const MIN_PASSWORD_LENGTH = 8 // zoals PocketBase

// Wat er niet klopt aan het formulier, als sleutel in messages/*.json
// (de component vertaalt hem), of null als het klopt.
export function validateSignup({ email, password, passwordConfirm }) {
  if (!email || !email.trim()) return 'account.enterEmail'
  if ((password || '').length < MIN_PASSWORD_LENGTH) return 'account.passwordTooShort'
  if (password !== passwordConfirm) return 'account.passwordsDiffer'
  return null
}

// PocketBase-fout bij een verzoek zonder account (inloggen, resetlink, mail
// opnieuw) naar een sleutel voor het scherm. De ruwe melding is Engels en
// technisch; die blijft in de console.
export function requestErrorKey(err) {
  // Limieten per IP: aanmelden 10 per uur, mail opnieuw 5 per 10 minuten.
  if (err?.status === 429) return 'account.tooManyAttempts'
  if (err?.status === 0) return 'account.offline'
  return 'account.somethingWrong'
}

// Account aanmaken: daarbij betekent een 400 op het e-mailadres dat het al
// bestaat.
export function signupErrorKey(err) {
  if (err?.status === 400 && err?.response?.data?.email) return 'account.emailTaken'
  return requestErrorKey(err)
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
