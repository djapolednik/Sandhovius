/// <reference path="../pb_data/types.d.ts" />
// Uitnodigingen: een beheerder nodigt iemand uit op e-mailadres. De
// uitnodiging hoort bij dat adres (geen token in de link): alleen wie met dat
// adres is ingelogd én het bevestigd heeft, ziet en accepteert hem.
//
// - Zien en verwijderen ("Intrekken" / "Weigeren"): een beheerder van het huis
//   of de genodigde.
// - Aanmaken: alleen een beheerder van dat huis, met invited_by = jezelf. De
//   hook in household.pb.js zet email in kleine letters, expires (+7 dagen),
//   house_name en inviter_name, en vervangt een oude uitnodiging voor
//   hetzelfde adres in hetzelfde huis.
// - Niet wijzigbaar: rol aanpassen = opnieuw uitnodigen.
// - Accepteren loopt via POST /api/sandhovius/invitations/{id}/accept.
//
// house_name en inviter_name staan op de uitnodiging zelf, omdat de genodigde
// het huis en de uitnodiger (nog) niet mag lezen.
//
// E-mailadressen worden in kleine letters opgeslagen; het adres van het
// account kan hoofdletters hebben, daarom ":lower".
const USERS = '@request.auth.collectionName = "users"'
const ADMIN = "house.admins.id ?= @request.auth.id"
const INVITEE = "(email = @request.auth.email:lower && @request.auth.verified = true)"
const SEE = USERS + " && (" + ADMIN + " || " + INVITEE + ")"

const RATE = { label: "invitations:create", audience: "@auth", duration: 3600, maxRequests: 20 }

migrate((app) => {
  const houses = app.findCollectionByNameOrId("houses")
  const users = app.findCollectionByNameOrId("users")
  const invitations = new Collection({
    type: "base",
    name: "invitations",
    listRule: SEE,
    viewRule: SEE,
    createRule:
      USERS + " && (@request.body.house.admins.id ?= @request.auth.id && @request.body.invited_by = @request.auth.id)",
    updateRule: null,
    deleteRule: SEE,
    fields: [
      { type: "relation", name: "house", required: true, collectionId: houses.id, cascadeDelete: true, maxSelect: 1 },
      { type: "email", name: "email", required: true },
      { type: "select", name: "role", required: true, values: ["admin", "member"], maxSelect: 1 },
      { type: "relation", name: "invited_by", required: false, collectionId: users.id, cascadeDelete: false, maxSelect: 1 },
      { type: "text", name: "house_name", max: 100 },
      { type: "text", name: "inviter_name", max: 255 },
      { type: "date", name: "expires" },
      { type: "autodate", name: "created", onCreate: true, onUpdate: false },
    ],
    indexes: ["CREATE UNIQUE INDEX `idx_invitations_house_email` ON `invitations` (`house`, `email`)"],
  })
  app.save(invitations)

  const settings = app.settings()
  settings.rateLimits.rules.push(RATE)
  app.save(settings)
}, (app) => {
  const settings = app.settings()
  settings.rateLimits.rules = settings.rateLimits.rules.filter((r) => r.label !== RATE.label)
  app.save(settings)
  app.delete(app.findCollectionByNameOrId("invitations"))
})
