// Zet een PocketBase-fout om in een melding voor de gebruiker: eerst wát
// er misging (what, al vertaald: "Opslaan", "Saving"), dan wat je kunt
// doen. De ruwe err.message is Engels en technisch ("Failed to fetch",
// "The requested resource wasn't found.") — die gaat alleen naar de
// console, nooit naar het scherm.
//
// ClientResponseError.status: 0 = geen verbinding / afgebroken,
// 400 = ongeldige invoer, 401/403 = sessie verlopen of geen rechten,
// 404 = bestaat niet (meer), 429 = te veel pogingen (rate limit).
const REASONS = { 0: 'offline', 400: 'invalid', 401: 'signedOut', 403: 'forbidden', 404: 'notFound', 429: 'tooMany' }

export function describeError(t, what, err) {
  console.error(`[${what}]`, err)
  const status = typeof err?.status === 'number' ? err.status : null
  return t(`errors.failed.${REASONS[status] ?? 'other'}`, { what })
}

// 401 = de sessie is verlopen of ongeldig. Dat los je niet op met "opnieuw
// proberen": de aanroeper stuurt de bewoner terug naar het inlogscherm.
export function isSessionExpired(err) {
  return err?.status === 401
}
