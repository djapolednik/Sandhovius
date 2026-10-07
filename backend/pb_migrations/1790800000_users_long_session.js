/// <reference path="../pb_data/types.d.ts" />
// Bewoners blijven ingelogd tot ze zelf uitloggen. Een token heeft altijd een
// vervaldatum; die zetten we op een jaar, en de PWA verlengt het token elke
// dag dat de app open gaat (lib/session.js). Alleen wie de app een jaar niet
// opent, logt opnieuw in.
//
// Vangnetten bij een gestolen token: wachtwoord wijzigen maakt alle tokens
// ongeldig, en inloggen vanaf een nieuw toestel geeft een melding per mail.
// Boxen houden hun eigen duur.
const OLD = 432000 // 5 dagen
const NEW = 365 * 24 * 60 * 60

const set = (app, from, to) => {
  const users = app.findCollectionByNameOrId("users")
  if (users.authToken.duration !== from) {
    throw new Error("users.authToken.duration is " + users.authToken.duration + ", verwacht " + from + "; pas deze migratie aan")
  }
  users.authToken.duration = to
  app.save(users)
}

migrate((app) => set(app, OLD, NEW), (app) => set(app, NEW, OLD))
