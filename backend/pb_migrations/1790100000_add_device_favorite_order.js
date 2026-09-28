/// <reference path="../pb_data/types.d.ts" />
// Volgorde van de favorieten op Home. Een getal op het apparaat zelf,
// net als "favorite"; de bestaande updateRule (eigenaar van het huis)
// dekt het zetten ervan al. Leeg (0) = op naam.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("devices")
  collection.fields.add(new NumberField({
    name: "favorite_order",
    required: false,
    onlyInt: true,
  }))
  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("devices")
  collection.fields.removeByName("favorite_order")
  return app.save(collection)
})
