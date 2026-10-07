/// <reference path="../pb_data/types.d.ts" />
// Favorieten per persoon: ieder lid van een huis heeft een eigen Home. Een
// favoriet is een record (user, device, order) in plaats van een vlag op het
// apparaat; anders verandert één huisgenoot Home voor iedereen.
//
// - Je ziet, maakt, wijzigt en verwijdert alleen je eigen favorieten, en alleen
//   voor een apparaat van een huis waar je lid van bent. Wijzigen is alleen de
//   volgorde: user en device liggen vast.
// - Geen box-tak: de agent heeft niets met favorieten te maken.
// - Device weg (of gebruiker weg) → favoriet weg (cascade). Een huis verlaten
//   ruimt de favorieten op in de hook van dat endpoint.
// - Bestaande favorieten: elk device met favorite = true wordt een favoriet
//   van ieder lid van het huis (na 1790760000 is dat de oude eigenaar), met
//   order = favorite_order. Daarna verdwijnen favorite en favorite_order, ook
//   uit de forbid-lijst van de box.
//
// "up" controleert eerst dat devices.updateRule precies de stand na
// 1790760000 is en stopt anders.
const BOX = '@request.auth.collectionName = "boxes" && @request.auth.house != ""'
const H = "@request.auth.house"
const USERS = '@request.auth.collectionName = "users"'

const forbid = (fields) => fields.map((f) => "@request.body." + f + ":isset = false").join(" && ")

const devicesUpdate = (boxForbid) =>
  "(" + USERS + " && (gateway.members.id ?= @request.auth.id)) || (" +
  BOX + " && gateway = " + H + " && " + forbid(boxForbid) + ")"

const DEVICES_UPDATE_OLD = devicesUpdate(["gateway", "name", "type", "room", "favorite", "favorite_order"])
const DEVICES_UPDATE_NEW = devicesUpdate(["gateway", "name", "type", "room"])

const OWN = "user = @request.auth.id && device.gateway.members.id ?= @request.auth.id"
const RULES = {
  listRule: USERS + " && (" + OWN + ")",
  viewRule: USERS + " && (" + OWN + ")",
  createRule:
    USERS + " && (@request.body.user = @request.auth.id && @request.body.device.gateway.members.id ?= @request.auth.id)",
  updateRule: USERS + " && (" + OWN + " && " + forbid(["user", "device"]) + ")",
  deleteRule: USERS + " && (" + OWN + ")",
}

migrate((app) => {
  const devices = app.findCollectionByNameOrId("devices")
  const have = devices.updateRule === null || devices.updateRule === undefined ? null : String(devices.updateRule)
  if (have !== DEVICES_UPDATE_OLD) {
    throw new Error("devices.updateRule wijkt af van de verwachte regel; pas deze migratie aan. Huidig: " + have)
  }

  const users = app.findCollectionByNameOrId("users")
  const favorites = new Collection({
    type: "base",
    name: "favorites",
    ...RULES,
    fields: [
      { type: "relation", name: "user", required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1 },
      { type: "relation", name: "device", required: true, collectionId: devices.id, cascadeDelete: true, maxSelect: 1 },
      { type: "number", name: "order", onlyInt: true },
    ],
    indexes: ["CREATE UNIQUE INDEX `idx_favorites_user_device` ON `favorites` (`user`, `device`)"],
  })
  app.save(favorites)

  for (const d of app.findAllRecords("devices")) {
    if (!d.getBool("favorite")) continue
    const house = app.findRecordById("houses", d.getString("gateway"))
    for (const u of house.getStringSlice("members")) {
      const f = new Record(favorites)
      f.set("user", u)
      f.set("device", d.id)
      f.set("order", d.getInt("favorite_order"))
      app.save(f)
    }
  }

  devices.fields.removeByName("favorite")
  devices.fields.removeByName("favorite_order")
  devices.updateRule = DEVICES_UPDATE_NEW
  app.save(devices)
}, (app) => {
  const devices = app.findCollectionByNameOrId("devices")
  devices.fields.add(new BoolField({ name: "favorite", required: false }))
  devices.fields.add(new NumberField({ name: "favorite_order", required: false, onlyInt: true }))
  devices.updateRule = DEVICES_UPDATE_OLD
  app.save(devices)

  // terug naar één vlag per device: de favorieten van de eerste beheerder
  for (const f of app.findAllRecords("favorites")) {
    const d = app.findRecordById("devices", f.getString("device"))
    const house = app.findRecordById("houses", d.getString("gateway"))
    if (house.getStringSlice("admins")[0] !== f.getString("user")) continue
    d.set("favorite", true)
    d.set("favorite_order", f.getInt("order"))
    app.saveNoValidate(d)
  }

  app.delete(app.findCollectionByNameOrId("favorites"))
})
