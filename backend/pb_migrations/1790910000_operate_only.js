/// <reference path="../pb_data/types.d.ts" />
// Rechten als één schakelaar (spec 2026-10-14-member-rights-design.md, roadmap
// D1). houses.operate_only: leden die alleen mogen bedienen. Zij mogen geen
// scènes, schema's, routines, bewegingslicht, kamers of apparaten wijzigen
// en niets koppelen; bedienen en hun eigen dingen (favorieten, thuis/weg,
// meldingen) blijven. Beheerders staan er nooit in (household.pb.js). Alleen
// het endpoint in household.pb.js zet het veld.
//
// Elke wijzigregel voor bewoners op die collecties krijgt een voorwaarde
// erachter; de box en andere ingelogden gaan er ongemoeid doorheen.
const USERS = '@request.auth.collectionName = "users"'
const guard = (path) => `(@request.auth.collectionName != "users" || ${path}.operate_only.id != @request.auth.id)`

// collectie → { regel: pad naar het huis }
const GUARDS = {
  rooms: { createRule: "@request.body.house", updateRule: "house", deleteRule: "house" },
  devices: { updateRule: "gateway", deleteRule: "gateway" },
  scenes: { createRule: "@request.body.house", updateRule: "house", deleteRule: "house" },
  schedules: { createRule: "@request.body.house", updateRule: "house", deleteRule: "house" },
  automations: { createRule: "@request.body.house", updateRule: "house", deleteRule: "house" },
  motion_lights: { createRule: "@request.body.house", updateRule: "house", deleteRule: "house" },
  pairing_sessions: { createRule: "@request.body.house", updateRule: "house" },
  pairing_candidates: { updateRule: "session.house" },
}

const HOUSE_GUARD = "@request.body.operate_only:isset = false"

migrate((app) => {
  const houses = app.findCollectionByNameOrId("houses")
  const users = app.findCollectionByNameOrId("users")
  houses.fields.add(new Field({ type: "relation", name: "operate_only", collectionId: users.id, maxSelect: 999 }))
  houses.updateRule = `(${houses.updateRule}) && ${HOUSE_GUARD}`
  app.save(houses)

  for (const [name, rules] of Object.entries(GUARDS)) {
    const collection = app.findCollectionByNameOrId(name)
    for (const [rule, path] of Object.entries(rules)) {
      if (collection[rule] === null) throw new Error(`${name}.${rule} is null; verwacht een regel`)
      collection[rule] = `(${collection[rule]}) && ${guard(path)}`
    }
    app.save(collection)
  }
}, (app) => {
  const strip = (rule, suffix) => (rule.endsWith(suffix) ? rule.slice(1, -suffix.length - 1) : rule)
  for (const [name, rules] of Object.entries(GUARDS)) {
    const collection = app.findCollectionByNameOrId(name)
    for (const [rule, path] of Object.entries(rules)) {
      collection[rule] = strip(collection[rule], ` && ${guard(path)}`)
    }
    app.save(collection)
  }
  const houses = app.findCollectionByNameOrId("houses")
  houses.updateRule = strip(houses.updateRule, ` && ${HOUSE_GUARD}`)
  houses.fields.removeByName("operate_only")
  return app.save(houses)
})
