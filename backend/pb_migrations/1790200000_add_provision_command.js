/// <reference path="../pb_data/types.d.ts" />
// "provision": de app vraagt de agent om een apparaat waarvan het
// klaarzetten mislukte opnieuw klaar te zetten (een Home Assistant-helper
// aanmaken), in plaats van dat de bewoner het moet verwijderen en opnieuw
// toevoegen.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("commands")
  const field = collection.fields.getByName("action")
  field.values = ["turn_on", "turn_off", "toggle", "set_temperature", "provision"]
  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("commands")
  const field = collection.fields.getByName("action")
  field.values = ["turn_on", "turn_off", "toggle", "set_temperature"]
  return app.save(collection)
})
