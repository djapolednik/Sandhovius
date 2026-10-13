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

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford-base32

// Controleteken (Luhn mod 32) over een genormaliseerde code zonder dat
// teken; gelijk aan check_char in scripts/claimcode.py (gedeelde vectoren in
// backend/tests/testdata/claim_check.json). Vangt elke enkele tikfout.
export function checkChar(body) {
  const n = ALPHABET.length
  let factor = 2
  let total = 0
  for (const c of [...body].reverse()) {
    const addend = factor * ALPHABET.indexOf(c)
    total += Math.floor(addend / n) + (addend % n)
    factor = 3 - factor
  }
  return ALPHABET[(n - (total % n)) % n]
}

export function isValidCode(code) {
  const c = normalize(code)
  return c.length === 12 && [...c].every((ch) => ALPHABET.includes(ch)) && checkChar(c.slice(0, -1)) === c.at(-1)
}

// Wat er mis is met een overgetikte code, vóór hij naar de server gaat; ''
// als hij klopt. Een tikfout zeggen verraadt niets: het controleteken zit
// in de code zelf, niet in een box.
export function codeProblem(code) {
  if (normalize(code).length !== 12) return 'claim.codeLength'
  if (!isValidCode(code)) return 'claim.codeTypo'
  return ''
}

// Serienummers staan in hoofdletters opgeslagen; "sh-dev-0001" mag ook.
export function normalizeSerial(serial) {
  return String(serial ?? '')
    .trim()
    .toUpperCase()
}

// "K7QM2XRP9DTW" → "K7QM-2XRP-9DTW", om te tonen.
export function formatCode(code) {
  return (normalize(code).match(/.{1,4}/g) || []).join('-')
}

// De QR-inhoud is <app-url>/koppel#s=<serienummer>&c=<code>. De code staat
// in het fragment (na #): dat stuurt de browser nooit naar een server, dus
// komt het in geen enkel log. Oudere bladen hebben ?s=…&c=…; die blijven
// werken. De host mag anders zijn (QR van een andere omgeving); alleen het
// pad en de parameters tellen. Andere tekst geeft null.
export function parseClaimLink(text) {
  let url
  try {
    url = new URL(String(text ?? '').trim())
  } catch {
    return null
  }
  if (url.pathname.replace(/\/+$/, '') !== '/koppel') return null
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))
  const params = fragment.has('s') || fragment.has('c') ? fragment : url.searchParams
  const serial = normalizeSerial(params.get('s'))
  const code = (params.get('c') || '').trim()
  if (!serial || !code) return null
  return { serial, code }
}

// Waarom koppelen of ontkoppelen niet lukte, in de taal van de app. err is
// de fout van pb.send (ClientResponseError).
export function claimError(t, err) {
  const status = err?.status ?? 0
  const response = err?.response || {}
  // De code van de hook (spec 2026-10-13-app-language-design, stap 3).
  if (response.code && t.has(`errors.codes.${response.code}`)) {
    return t(`errors.codes.${response.code}`, response.params || {})
  }
  switch (status) {
    case 403:
      return t('errors.codes.email_not_verified')
    case 400:
      return t('errors.codes.invalid_code')
    case 409:
      return t('errors.codes.box_already_linked')
    case 404:
      return t('errors.codes.house_not_found')
    case 429:
      return t('claim.tooMany')
    case 503:
      return t('errors.codes.claim_unavailable')
    case 0:
      return t('claim.offline')
    default:
      return t('claim.other')
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
