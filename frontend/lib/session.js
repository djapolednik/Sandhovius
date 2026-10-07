import { getTokenPayload } from 'pocketbase'

// Een inlogtoken van PocketBase geldt een vast aantal dagen (users: 5) en
// wordt niet vanzelf verlengd. Wie de app gewoon blijft gebruiken, moet niet
// om de 5 dagen opnieuw inloggen: bij het openen van de app en bij terugkeer
// verlengen we het token zodra het ouder is dan ongeveer een dag (er resten
// dan minder dan REFRESH_BEFORE). Zo gebeurt het hooguit eens per dag.
const REFRESH_BEFORE = 4 * 24 * 60 * 60 * 1000

// Al verlopen of onleesbaar: niet verlengen (dat lukt niet meer), dan is
// opnieuw inloggen het eerlijke antwoord.
export function needsRefresh(token, now = Date.now()) {
  const exp = getTokenPayload(token)?.exp
  if (!exp) return false
  const left = exp * 1000 - now
  return left > 0 && left < REFRESH_BEFORE
}
