/// <reference path="../pb_data/types.d.ts" />
// Box-status in woorden (roadmap K1): de bewoner ziet welke software de box
// draait en sinds wanneer ("Software 1.4.2, bijgewerkt op 14 oktober"). Het
// box-record is alleen voor de box zelf, dus box.pb.js zet de versie ook op
// het huis. Alleen die hook schrijft deze velden: de updateRule weigert ze
// voor iedereen.
const GUARD = "@request.body.box_version:isset = false && @request.body.box_version_since:isset = false"

migrate((app) => {
  const houses = app.findCollectionByNameOrId("houses")
  houses.fields.add(new Field({ type: "text", name: "box_version", max: 64 }))
  houses.fields.add(new Field({ type: "date", name: "box_version_since" }))
  houses.updateRule = `(${houses.updateRule}) && ${GUARD}`
  return app.save(houses)
}, (app) => {
  const houses = app.findCollectionByNameOrId("houses")
  const suffix = ` && ${GUARD}`
  if (houses.updateRule.endsWith(suffix)) houses.updateRule = houses.updateRule.slice(1, -suffix.length - 1)
  houses.fields.removeByName("box_version")
  houses.fields.removeByName("box_version_since")
  return app.save(houses)
})
