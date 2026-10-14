/// <reference path="../pb_data/types.d.ts" />
// Gast met een einddatum (spec 2026-10-14-guests-design.md, roadmap D2).
//
// - invitations.until ("JJJJ-MM-DD", de gekozen dag, voor de tekst) en
//   invitations.ends (het einde van die dag als tijdstip, door de app
//   uitgerekend in de tijdzone van de telefoon). Leeg = gewoon huisgenoot.
// - guests: wie tot wanneer lid is. Alleen de hooks schrijven (accepteren,
//   beheerder maken, vertrekken, de cron die verlopen gasten weghaalt).
migrate((app) => {
  const invitations = app.findCollectionByNameOrId("invitations")
  invitations.fields.add(new Field({ type: "text", name: "until", max: 10, pattern: "^(\\d{4}-\\d{2}-\\d{2})?$" }))
  invitations.fields.add(new Field({ type: "date", name: "ends" }))
  app.save(invitations)

  const houses = app.findCollectionByNameOrId("houses")
  const users = app.findCollectionByNameOrId("users")
  const SEE = '@request.auth.collectionName = "users" && house.members.id ?= @request.auth.id'
  const guests = new Collection({
    type: "base",
    name: "guests",
    listRule: SEE,
    viewRule: SEE,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "house", required: true, collectionId: houses.id, cascadeDelete: true, maxSelect: 1 },
      { type: "relation", name: "user", required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1 },
      { type: "text", name: "until", required: true, max: 10 },
      { type: "date", name: "ends", required: true },
      { type: "autodate", name: "created", onCreate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_guests_house_user ON guests (house, user)"],
  })
  return app.save(guests)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("guests"))
  const invitations = app.findCollectionByNameOrId("invitations")
  invitations.fields.removeByName("until")
  invitations.fields.removeByName("ends")
  return app.save(invitations)
})
