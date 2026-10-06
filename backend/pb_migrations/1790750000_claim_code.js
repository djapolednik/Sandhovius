/// <reference path="../pb_data/types.d.ts" />
// Koppelcode voor boxen. Op de sticker van een box staat een code van 12
// tekens; de box zelf bewaart alleen de sha256-hash ervan in "claim_code_hash".
// Het veld is hidden: het komt nooit in een API-antwoord voor, ook niet voor
// de box zelf of een superuser-export via de gewone routes. Alleen de hook in
// pb_hooks/claim.pb.js (en de provisioning-scripts met superuser-rechten)
// lezen en schrijven het. Een box zonder hash (oudere boxen) is niet te claimen.
//
// Daarnaast een eigen rate limit op claim en release: 10 per minuut per
// IP-adres (niet per gebruiker), tegen het raden van codes. Let op: PocketBase matcht een
// pad-label alleen exact (een voorvoegsel als "/api/sandhovius/" werkt niet en
// valt terug op de ruime regel "/api/"), dus elk endpoint krijgt een eigen regel.
const RULES = [
  { label: "/api/sandhovius/claim", audience: "@auth", duration: 60, maxRequests: 10 },
  { label: "/api/sandhovius/release", audience: "@auth", duration: 60, maxRequests: 10 },
]

migrate((app) => {
  const boxes = app.findCollectionByNameOrId("boxes")
  boxes.fields.add(new TextField({ name: "claim_code_hash", hidden: true, max: 128 }))
  app.save(boxes)

  const settings = app.settings()
  for (const r of RULES) settings.rateLimits.rules.push(r)
  app.save(settings)
}, (app) => {
  const settings = app.settings()
  settings.rateLimits.rules = settings.rateLimits.rules.filter((r) => !RULES.some((x) => x.label === r.label))
  app.save(settings)

  const boxes = app.findCollectionByNameOrId("boxes")
  boxes.fields.removeByName("claim_code_hash")
  app.save(boxes)
})
