import { getTokenPayload } from 'pocketbase'

// Bewoners blijven ingelogd tot ze zelf uitloggen. Een token van PocketBase
// heeft altijd een vervaldatum (users: een jaar, migratie 1790800000) en wordt
// niet vanzelf verlengd. Daarom verlengen we het bij het openen van de app en
// bij terugkeer, hooguit eens per dag per toestel (REFRESH_EVERY, gerekend
// vanaf de laatste verlenging op dit toestel). Zo hangt dit niet af van de
// duur op de server, en wordt een ouder, korter token meteen omgezet.
const REFRESH_EVERY = 24 * 60 * 60 * 1000

export const LAST_REFRESH_KEY = 'sandhovius-session-refreshed'

// Al verlopen of onleesbaar: niet verlengen (dat lukt niet meer), dan is
// opnieuw inloggen het eerlijke antwoord.
export function needsRefresh(token, lastRefresh, now = Date.now()) {
  const exp = getTokenPayload(token)?.exp
  if (!exp || exp * 1000 <= now) return false
  return !lastRefresh || now - lastRefresh >= REFRESH_EVERY
}
