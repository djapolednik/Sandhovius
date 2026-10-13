/// <reference path="../pb_data/types.d.ts" />
// Bewegingslicht: bij beweging op een sensor gaan lampen aan, en N minuten na
// de laatste beweging weer uit (spec 2026-10-13-motion-light-design). De
// agent op de box beslist, uit de lokale stroom van events; de app bewerkt
// alleen deze records.
//
// - Leden van het huis beheren ze, zoals scènes en schema's; sensor en lampen
//   moeten uit hetzelfde huis komen.
// - last_run / last_error schrijft alleen de box (diagnose, de app toont
//   alleen óf er een fout is).
// - devices is niet verplicht als veld: dan zou PocketBase het verwijderen
//   van de laatste lamp weigeren (hij moet de lijst leeg maken). De regels
//   eisen minstens één lamp bij aanmaken en wijzigen.
migrate((app) => {
  const houses = app.findCollectionByNameOrId("houses")
  const devices = app.findCollectionByNameOrId("devices")

  const USERS = '@request.auth.collectionName = "users"'
  const BOX = '@request.auth.collectionName = "boxes" && @request.auth.house != ""'
  const member = "house.members.id ?= @request.auth.id"
  const forbid = (fields) => fields.map((f) => "@request.body." + f + ":isset = false").join(" && ")
  const boxOnly = forbid(["last_run", "last_error"])

  const motionLights = new Collection({
    type: "base",
    name: "motion_lights",
    listRule: `(${USERS} && ${member}) || (${BOX} && house = @request.auth.house)`,
    viewRule: `(${USERS} && ${member}) || (${BOX} && house = @request.auth.house)`,
    createRule:
      `${USERS} && @request.body.house.members.id ?= @request.auth.id && ` +
      "@request.body.sensor.gateway = @request.body.house && " +
      "@request.body.devices:length > 0 && @request.body.devices.gateway = @request.body.house && " +
      boxOnly,
    updateRule:
      `(${USERS} && ${member} && @request.body.house:isset = false && ` +
      "(@request.body.sensor:isset = false || @request.body.sensor.gateway = house) && " +
      "(@request.body.devices:isset = false || " +
      "(@request.body.devices:length > 0 && @request.body.devices.gateway = house)) && " +
      `${boxOnly}) || ` +
      `(${BOX} && house = @request.auth.house && ` +
      forbid(["house", "sensor", "devices", "only_dark", "off_after", "enabled"]) +
      ")",
    deleteRule: `${USERS} && ${member}`,
    fields: [
      { type: "relation", name: "house", required: true, collectionId: houses.id, cascadeDelete: true, maxSelect: 1 },
      // Sensor weg: het bewegingslicht heeft geen zin meer en gaat mee.
      { type: "relation", name: "sensor", required: true, collectionId: devices.id, cascadeDelete: true, maxSelect: 1 },
      // Een lamp weg: alleen die valt uit de lijst.
      { type: "relation", name: "devices", collectionId: devices.id, cascadeDelete: false, maxSelect: 10 },
      { type: "bool", name: "only_dark" },
      { type: "number", name: "off_after", required: true, min: 1, max: 60, onlyInt: true },
      { type: "bool", name: "enabled" },
      { type: "date", name: "last_run" },
      { type: "text", name: "last_error", max: 2000 },
    ],
  })
  return app.save(motionLights)
}, (app) => {
  return app.delete(app.findCollectionByNameOrId("motion_lights"))
})
