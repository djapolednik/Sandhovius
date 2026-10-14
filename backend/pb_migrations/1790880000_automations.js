/// <reference path="../pb_data/types.d.ts" />
// Routines (spec 2026-10-14-routines-design.md): als dit gebeurt (starter),
// alleen als (voorwaarden), doe dat (acties), en eventueel daarna uit. Leden
// van het huis beheren ze; de agent op de box beslist en voert uit.
//
// starter, conditions en actions zijn JSON uit een gesloten lijst; de regels
// kunnen daar niet in kijken, dus automation_rules.js controleert soorten,
// apparaten en scènes uit het eigen huis en grenzen. last_run, last_error en
// next_run schrijft alleen de box.
migrate((app) => {
  const houses = app.findCollectionByNameOrId("houses")

  const USERS = '@request.auth.collectionName = "users"'
  const BOX = '@request.auth.collectionName = "boxes" && @request.auth.house != ""'
  const member = "house.members.id ?= @request.auth.id"
  const forbid = (fields) => fields.map((f) => "@request.body." + f + ":isset = false").join(" && ")
  const boxOnly = forbid(["last_run", "last_error", "next_run"])

  const automations = new Collection({
    type: "base",
    name: "automations",
    listRule: `(${USERS} && ${member}) || (${BOX} && house = @request.auth.house)`,
    viewRule: `(${USERS} && ${member}) || (${BOX} && house = @request.auth.house)`,
    createRule: `${USERS} && @request.body.house.members.id ?= @request.auth.id && ${boxOnly}`,
    updateRule:
      `(${USERS} && ${member} && @request.body.house:isset = false && ${boxOnly}) || ` +
      `(${BOX} && house = @request.auth.house && ` +
      forbid(["house", "name", "enabled", "starter", "conditions", "actions", "off_after"]) +
      ")",
    deleteRule: `${USERS} && ${member}`,
    fields: [
      { type: "relation", name: "house", required: true, collectionId: houses.id, cascadeDelete: true, maxSelect: 1 },
      { type: "text", name: "name", max: 80 },
      { type: "bool", name: "enabled" },
      { type: "json", name: "starter", maxSize: 2000 },
      { type: "json", name: "conditions", maxSize: 4000 },
      { type: "json", name: "actions", maxSize: 8000 },
      { type: "number", name: "off_after", onlyInt: true, min: 0, max: 60 },
      { type: "date", name: "last_run" },
      { type: "text", name: "last_error", max: 2000 },
      { type: "date", name: "next_run" },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
  })
  return app.save(automations)
}, (app) => {
  return app.delete(app.findCollectionByNameOrId("automations"))
})
