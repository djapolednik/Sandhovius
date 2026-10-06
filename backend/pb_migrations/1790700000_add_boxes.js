/// <reference path="../pb_data/types.d.ts" />
// Elke box krijgt een eigen inlog (collectie "boxes") in plaats van het
// superuser-account. Identiteit is het serienummer; de box hoort bij hooguit
// één huis. Een box ziet alleen zichzelf en kan zijn eigen record niet
// wijzigen: koppelen aan een huis doet alleen de superuser.
//
// Ook: "houses.claimed_at" was een autodate (werd bij het aanmaken van het
// huis meteen gevuld). Het hoort leeg te zijn tot een bewoner de box
// daadwerkelijk claimt, dus het wordt een gewoon datumveld.
//
// Rate limits gaan aan, met een eigen regel van 10 pogingen per minuut op
// box-logins. Let op: dat zet ook de standaardregels van PocketBase aan
// (o.a. *:auth, *:create en /api/); bewoner-login moet daaronder blijven werken.
migrate((app) => {
  const houses = app.findCollectionByNameOrId("houses")

  const boxes = new Collection({
    type: "auth",
    name: "boxes",
    listRule: "id = @request.auth.id",
    viewRule: "id = @request.auth.id",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    passwordAuth: { enabled: true, identityFields: ["serial"] },
    oauth2: { enabled: false },
    otp: { enabled: false },
    mfa: { enabled: false },
    fields: [
      { type: "text", name: "serial", required: true, max: 60 },
      { type: "relation", name: "house", required: false, collectionId: houses.id, cascadeDelete: false, maxSelect: 1 },
    ],
    indexes: ["CREATE UNIQUE INDEX `idx_boxes_serial` ON `boxes` (`serial`)"],
  })
  app.save(boxes)

  // Een box heeft geen e-mailadres; inloggen gaat op serienummer. Het
  // systeemveld "email" bestaat pas na de eerste save en is standaard verplicht.
  const saved = app.findCollectionByNameOrId("boxes")
  saved.fields.getByName("email").required = false
  app.save(saved)

  houses.fields.removeByName("claimed_at")
  houses.fields.add(new DateField({ name: "claimed_at" }))
  app.save(houses)

  const settings = app.settings()
  settings.rateLimits.enabled = true
  settings.rateLimits.rules.push({ label: "boxes:auth", audience: "@guest", duration: 60, maxRequests: 10 })
  app.save(settings)
}, (app) => {
  const settings = app.settings()
  settings.rateLimits.rules = settings.rateLimits.rules.filter((r) => r.label !== "boxes:auth")
  settings.rateLimits.enabled = false
  app.save(settings)

  const houses = app.findCollectionByNameOrId("houses")
  houses.fields.removeByName("claimed_at")
  houses.fields.add(new AutodateField({ name: "claimed_at", onCreate: true, onUpdate: false }))
  app.save(houses)

  app.delete(app.findCollectionByNameOrId("boxes"))
})
