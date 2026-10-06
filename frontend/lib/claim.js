// Een box koppelen: de code normaliseren, de QR-link lezen, foutteksten.
// normalize() moet exact gelijk zijn aan de hook (backend) en het
// printscript; de gedeelde testvectoren staan in
// backend/tests/testdata/claim_codes.json.

export const pendingKey = 'sandhovius.claim'

// Hoofdletters; spaties en "-" weg; O→0, I→1, L→1 (Crockford).
export function normalize(code) {
  return String(code ?? '')
    .toUpperCase()
    .replace(/[ -]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}

// "K7QM2XRP9DTW" → "K7QM-2XRP-9DTW", om te tonen.
export function formatCode(code) {
  return (normalize(code).match(/.{1,4}/g) || []).join('-')
}

// De QR-inhoud is <app-url>/koppel?s=<serienummer>&c=<code>. De host mag
// anders zijn (QR van een andere omgeving); alleen het pad en de
// parameters tellen. Andere tekst geeft null.
export function parseClaimLink(text) {
  let url
  try {
    url = new URL(String(text ?? '').trim())
  } catch {
    return null
  }
  if (url.pathname.replace(/\/+$/, '') !== '/koppel') return null
  const serial = (url.searchParams.get('s') || '').trim()
  const code = (url.searchParams.get('c') || '').trim()
  if (!serial || !code) return null
  return { serial, code }
}

export function claimErrorMessage(status, message) {
  switch (status) {
    case 403:
      return 'Bevestig eerst je e-mailadres'
    case 400:
      return 'Deze code klopt niet'
    case 409:
      return 'Deze box is al gekoppeld'
    case 404:
      return 'Dit huis is niet gevonden'
    case 429:
      return 'Te veel pogingen, probeer het over een minuut opnieuw'
    case 0:
      return 'Geen verbinding met Sandhovius. Controleer je internet en probeer het opnieuw'
    default:
      return 'Er ging iets mis. Probeer het zo opnieuw'
  }
}

// houses.last_seen is een autodate: ook het opslaan van het huis bij het
// koppelen zet hem op (bijna) hetzelfde moment als claimed_at. Pas een
// hartslag die duidelijk later komt telt als "de box meldt zich".
const CLAIM_GRACE_MS = 2000

// De box meldt zich als zijn hartslag nieuwer is dan het moment van
// koppelen (claimedAt komt van de server, dus geen klokverschil met de
// telefoon). Een vervangen huis heeft nog de hartslag van de oude box.
export function isBoxOnline(house, claimedAt) {
  if (!house?.last_seen) return false
  const seen = new Date(house.last_seen).getTime()
  if (Number.isNaN(seen)) return false
  if (!claimedAt) return true
  const claimed = new Date(claimedAt).getTime()
  return Number.isNaN(claimed) || seen > claimed + CLAIM_GRACE_MS
}
