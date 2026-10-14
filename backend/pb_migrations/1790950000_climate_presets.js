/// <reference path="../pb_data/types.d.ts" />
// Klimaatstanden (roadmap F2): Comfort, Eco en Slaap als temperaturen van het
// huis. De Sonoff TRVZB kent zelf geen standen (alleen system_mode en een
// setpoint), dus het huis onthoudt ze en de app en de box sturen ze als
// setpoint. 0 = de standaard (20 / 17 / 16). Beheerders zetten ze (de gewone
// updateRule van houses); de box niet. house_rules.js bewaakt het bereik.
const FIELDS = ["climate_comfort", "climate_eco", "climate_sleep"]
const GUARD =
  '(@request.auth.collectionName != "boxes" || (' + FIELDS.map((f) => `@request.body.${f}:isset = false`).join(" && ") + "))"

migrate((app) => {
  const houses = app.findCollectionByNameOrId("houses")
  for (const name of FIELDS) houses.fields.add(new Field({ type: "number", name: name }))
  houses.updateRule = `(${houses.updateRule}) && ${GUARD}`
  return app.save(houses)
}, (app) => {
  const houses = app.findCollectionByNameOrId("houses")
  const suffix = ` && ${GUARD}`
  if (houses.updateRule.endsWith(suffix)) houses.updateRule = houses.updateRule.slice(1, -suffix.length - 1)
  for (const name of FIELDS) houses.fields.removeByName(name)
  return app.save(houses)
})
