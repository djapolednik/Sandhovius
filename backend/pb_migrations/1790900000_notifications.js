/// <reference path="../pb_data/types.d.ts" />
// Meldingen (spec 2026-10-14-notifications-design.md, roadmap B2). De box
// verstuurt Web Push zelf; PocketBase bewaart alleen wie wat wil ontvangen.
//
// - houses.push_key: het publieke deel van de VAPID-sleutel van de box. Alleen
//   de box schrijft het: de bestaande updateRule krijgt er een voorwaarde bij
//   voor iedereen die geen box is.
// - push_subscriptions: per apparaat waarop iemand meldingen aanzette. Je
//   eigen; de box van het huis leest en ruimt verlopen aanmeldingen op.
// - notification_rules: Meld dit, per sensor en per huisgenoot (hook
//   notification_rules.js).
const PUSH_KEY_GUARD = '(@request.auth.collectionName = "boxes" || @request.body.push_key:isset = false)'

migrate((app) => {
  const houses = app.findCollectionByNameOrId("houses")
  const users = app.findCollectionByNameOrId("users")
  const devices = app.findCollectionByNameOrId("devices")

  houses.fields.add(new Field({ type: "text", name: "push_key", max: 200 }))
  houses.updateRule = `(${houses.updateRule}) && ${PUSH_KEY_GUARD}`
  app.save(houses)

  const USERS = '@request.auth.collectionName = "users"'
  const BOX = '@request.auth.collectionName = "boxes" && @request.auth.house != ""'
  const member = "house.members.id ?= @request.auth.id"
  const own = `${USERS} && user = @request.auth.id && ${member}`
  const boxRead = `(${BOX} && house = @request.auth.house)`
  const fixed = "@request.body.user:isset = false && @request.body.house:isset = false"
  const createOwn = `${USERS} && @request.body.user = @request.auth.id && @request.body.house.members.id ?= @request.auth.id`

  const subscriptions = new Collection({
    type: "base",
    name: "push_subscriptions",
    listRule: `(${own}) || ${boxRead}`,
    viewRule: `(${own}) || ${boxRead}`,
    createRule: createOwn,
    updateRule: `${own} && ${fixed}`,
    deleteRule: `(${own}) || ${boxRead}`,
    fields: [
      { type: "relation", name: "house", required: true, collectionId: houses.id, cascadeDelete: true, maxSelect: 1 },
      { type: "relation", name: "user", required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1 },
      { type: "url", name: "endpoint", required: true },
      { type: "text", name: "p256dh", required: true, max: 200 },
      { type: "text", name: "auth", required: true, max: 100 },
      { type: "text", name: "key", required: true, max: 200 },
      { type: "select", name: "language", values: ["nl", "en"], maxSelect: 1 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_push_subscriptions_endpoint ON push_subscriptions (house, endpoint)"],
  })
  app.save(subscriptions)

  const rules = new Collection({
    type: "base",
    name: "notification_rules",
    listRule: `(${own}) || ${boxRead}`,
    viewRule: `(${own}) || ${boxRead}`,
    createRule: createOwn,
    updateRule: `${own} && ${fixed}`,
    deleteRule: own,
    fields: [
      { type: "relation", name: "house", required: true, collectionId: houses.id, cascadeDelete: true, maxSelect: 1 },
      { type: "relation", name: "user", required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1 },
      { type: "relation", name: "device", required: true, collectionId: devices.id, cascadeDelete: true, maxSelect: 1 },
      { type: "select", name: "event", required: true, values: ["open", "motion"], maxSelect: 1 },
      { type: "bool", name: "nobody_home" },
      { type: "text", name: "from", max: 5 },
      { type: "text", name: "to", max: 5 },
      { type: "bool", name: "enabled" },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_notification_rules_user_device ON notification_rules (user, device, event)"],
  })
  return app.save(rules)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("notification_rules"))
  app.delete(app.findCollectionByNameOrId("push_subscriptions"))
  const houses = app.findCollectionByNameOrId("houses")
  houses.fields.removeByName("push_key")
  const suffix = ` && ${PUSH_KEY_GUARD}`
  if (houses.updateRule.endsWith(suffix)) {
    houses.updateRule = houses.updateRule.slice(1, -suffix.length - 1)
  }
  return app.save(houses)
})
