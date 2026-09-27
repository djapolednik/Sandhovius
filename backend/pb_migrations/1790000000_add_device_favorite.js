/// <reference path="../pb_data/types.d.ts" />
// Favorieten: een apparaat dat de bewoner met een ster markeert, staat op
// het Home-scherm van de PWA. Alleen een vlag op het apparaat zelf — de
// bestaande updateRule (eigenaar van het huis) dekt het zetten ervan al.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("devices")
  collection.fields.add(new BoolField({
    name: "favorite",
    required: false,
  }))
  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("devices")
  collection.fields.removeByName("favorite")
  return app.save(collection)
})
