/// <reference path="../pb_data/types.d.ts" />
// Thuis of weg (spec 2026-10-14-presence-design.md, roadmap B3): één rij per
// lid per huis. Geen rij = thuis, zodat "iedereen weg" pas afgaat als iedereen
// het echt zette. Je zet alleen je eigen stand; iedereen in het huis ziet hem,
// de box leest hem voor routines. Verlaten of verwijderd worden ruimt de rij
// op (household.pb.js); een account weg = cascade.
migrate((app) => {
  const houses = app.findCollectionByNameOrId("houses")
  const users = app.findCollectionByNameOrId("users")

  const USERS = '@request.auth.collectionName = "users"'
  const BOX = '@request.auth.collectionName = "boxes" && @request.auth.house != ""'
  const member = "house.members.id ?= @request.auth.id"

  const presence = new Collection({
    type: "base",
    name: "presence",
    listRule: `(${USERS} && ${member}) || (${BOX} && house = @request.auth.house)`,
    viewRule: `(${USERS} && ${member}) || (${BOX} && house = @request.auth.house)`,
    createRule: `${USERS} && @request.body.user = @request.auth.id && @request.body.house.members.id ?= @request.auth.id`,
    updateRule: `${USERS} && user = @request.auth.id && ${member} && @request.body.user:isset = false && @request.body.house:isset = false`,
    deleteRule: null,
    fields: [
      { type: "relation", name: "house", required: true, collectionId: houses.id, cascadeDelete: true, maxSelect: 1 },
      { type: "relation", name: "user", required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1 },
      { type: "bool", name: "home" },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_presence_house_user ON presence (house, user)"],
  })
  return app.save(presence)
}, (app) => {
  return app.delete(app.findCollectionByNameOrId("presence"))
})
