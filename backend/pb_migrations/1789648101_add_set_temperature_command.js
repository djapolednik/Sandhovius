/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("commands")
  const field = collection.fields.getByName("action")
  field.values = ["turn_on", "turn_off", "toggle", "set_temperature"]
  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("commands")
  const field = collection.fields.getByName("action")
  field.values = ["turn_on", "turn_off", "toggle"]
  return app.save(collection)
})
