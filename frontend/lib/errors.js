// Zet een PocketBase-fout om in een Nederlandse melding voor de gebruiker:
// eerst wát er misging (door de aanroeper meegegeven), dan wat je kunt
// doen. De ruwe err.message is Engels en technisch ("Failed to fetch",
// "The requested resource wasn't found.") — die gaat alleen naar de
// console, nooit naar het scherm.
//
// ClientResponseError.status: 0 = geen verbinding / afgebroken,
// 400 = ongeldige invoer, 401/403 = sessie verlopen of geen rechten,
// 404 = bestaat niet (meer).
export function describeError(what, err) {
  console.error(`[${what}]`, err)
  const status = typeof err?.status === 'number' ? err.status : null

  if (status === 0) {
    return `${what} is niet gelukt. Sandhovius is nu niet bereikbaar; controleer je internetverbinding en probeer het opnieuw.`
  }
  if (status === 401) {
    return `${what} is niet gelukt. Je bent uitgelogd; log opnieuw in.`
  }
  if (status === 403) {
    return `${what} is niet gelukt. Dit mag je account niet aanpassen.`
  }
  if (status === 404) {
    return `${what} is niet gelukt. Het bestaat niet meer; ververs de pagina.`
  }
  if (status === 400) {
    return `${what} is niet gelukt. Controleer de ingevulde gegevens.`
  }
  return `${what} is niet gelukt. Probeer het zo opnieuw.`
}

// 401 = de sessie is verlopen of ongeldig. Dat los je niet op met "opnieuw
// proberen": de aanroeper stuurt de bewoner terug naar het inlogscherm.
export function isSessionExpired(err) {
  return err?.status === 401
}
