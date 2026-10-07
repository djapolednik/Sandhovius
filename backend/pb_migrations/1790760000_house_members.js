/// <reference path="../pb_data/types.d.ts" />
// Een huis heeft leden (members) en beheerders (admins) in plaats van één
// "user". Invariant: admins is een deel van members en nooit leeg. Die
// invariant bewaken de endpoints in pb_hooks (uitnodigen, rol wijzigen,
// verwijderen, verlaten); daarom mag niemand members of admins met een gewone
// PATCH zetten, ook een beheerder niet.
//
// - Elk lid bedient het huis: overal waar "user = @request.auth.id" stond
//   staat nu "members.id ?= @request.auth.id".
// - Alleen een beheerder wijzigt het huis zelf (hernoemen).
// - Bestaande huizen: user gaat in members en in admins; daarna verdwijnt user.
//
// Beide relaties zijn meervoudig. Let op: in PocketBase 0.40 betekent
// maxSelect 0 of 1 een enkelvoudige relatie (houses.user had maxSelect 0), dus
// "onbeperkt" is hier een ruime bovengrens.
//
// De regels zijn volledig uitgeschreven (oud = stand na 1790730000, op dezelfde
// manier opgebouwd). "up" controleert eerst dat de huidige regels precies "oud"
// zijn en stopt anders, zodat een latere handmatige wijziging niet stilletjes
// wordt overschreven.
const BOX = '@request.auth.collectionName = "boxes" && @request.auth.house != ""'
const H = "@request.auth.house"
const USERS = '@request.auth.collectionName = "users"'
const MAX_MEMBERS = 999

const forbid = (fields) => fields.map((f) => "@request.body." + f + ":isset = false").join(" && ")

// Bewonersregels per collectie: oud (stand na 1790730000) en nieuw. Alleen
// "user = @request.auth.id" wordt "members.id ?= @request.auth.id"; alles
// daaromheen blijft letterlijk gelijk.
//
// Let op ".id": op PocketBase 0.40.4 matcht "members ?= x" (zonder .id) nooit,
// ook niet als x in members staat; "members.id ?= x" wel (getest in
// backend/tests/household_test.go).
const RES_OLD = {
  houses: {
    listRule: "user = @request.auth.id",
    viewRule: "user = @request.auth.id",
    createRule: null,
    updateRule: "user = @request.auth.id && @request.body.weather:isset = false && @request.body.weather_updated:isset = false",
    deleteRule: null,
  },
  devices: {
    listRule: "gateway.user = @request.auth.id",
    viewRule: "gateway.user = @request.auth.id",
    createRule: "@request.body.gateway.user = @request.auth.id",
    updateRule: "gateway.user = @request.auth.id",
    deleteRule: "gateway.user = @request.auth.id",
  },
  device_state: {
    listRule: "device.gateway.user = @request.auth.id",
    viewRule: "device.gateway.user = @request.auth.id",
    createRule: null,
    updateRule: null,
    deleteRule: null,
  },
  commands: {
    listRule: "(device.gateway.user = @request.auth.id || scene.house.user = @request.auth.id)",
    viewRule: "(device.gateway.user = @request.auth.id || scene.house.user = @request.auth.id)",
    createRule:
      'status = "pending" && (' +
      '(action != "run_scene" && scene = "" && device.gateway.user = @request.auth.id) || ' +
      '(action = "run_scene" && device = "" && scene.house.user = @request.auth.id))',
    updateRule: null,
    deleteRule: null,
  },
  scenes: {
    listRule: "house.user = @request.auth.id",
    viewRule: "house.user = @request.auth.id",
    createRule: "@request.body.house.user = @request.auth.id",
    updateRule: "house.user = @request.auth.id && @request.body.house:isset = false",
    deleteRule: "house.user = @request.auth.id",
  },
  schedules: {
    listRule: "house.user = @request.auth.id",
    viewRule: "house.user = @request.auth.id",
    createRule:
      "@request.body.house.user = @request.auth.id && @request.body.scene.house = @request.body.house && " +
      "@request.body.last_run:isset = false && @request.body.last_error:isset = false",
    updateRule:
      "house.user = @request.auth.id && @request.body.house:isset = false && " +
      "(@request.body.scene:isset = false || @request.body.scene.house = house) && " +
      "@request.body.last_run:isset = false && @request.body.last_error:isset = false",
    deleteRule: "house.user = @request.auth.id",
  },
  rooms: {
    listRule: "house.user = @request.auth.id",
    viewRule: "house.user = @request.auth.id",
    createRule: "@request.body.house.user = @request.auth.id",
    updateRule: "house.user = @request.auth.id",
    deleteRule: "house.user = @request.auth.id",
  },
}

const RES_NEW = {
  houses: {
    listRule: "members.id ?= @request.auth.id",
    viewRule: "members.id ?= @request.auth.id",
    createRule: null,
    // alleen een beheerder; de verboden velden staan in EXTRA_NEW
    updateRule: "admins.id ?= @request.auth.id",
    deleteRule: null,
  },
  devices: {
    listRule: "gateway.members.id ?= @request.auth.id",
    viewRule: "gateway.members.id ?= @request.auth.id",
    createRule: "@request.body.gateway.members.id ?= @request.auth.id",
    updateRule: "gateway.members.id ?= @request.auth.id",
    deleteRule: "gateway.members.id ?= @request.auth.id",
  },
  device_state: {
    listRule: "device.gateway.members.id ?= @request.auth.id",
    viewRule: "device.gateway.members.id ?= @request.auth.id",
    createRule: null,
    updateRule: null,
    deleteRule: null,
  },
  commands: {
    listRule: "(device.gateway.members.id ?= @request.auth.id || scene.house.members.id ?= @request.auth.id)",
    viewRule: "(device.gateway.members.id ?= @request.auth.id || scene.house.members.id ?= @request.auth.id)",
    createRule:
      'status = "pending" && (' +
      '(action != "run_scene" && scene = "" && device.gateway.members.id ?= @request.auth.id) || ' +
      '(action = "run_scene" && device = "" && scene.house.members.id ?= @request.auth.id))',
    updateRule: null,
    deleteRule: null,
  },
  scenes: {
    listRule: "house.members.id ?= @request.auth.id",
    viewRule: "house.members.id ?= @request.auth.id",
    createRule: "@request.body.house.members.id ?= @request.auth.id",
    updateRule: "house.members.id ?= @request.auth.id && @request.body.house:isset = false",
    deleteRule: "house.members.id ?= @request.auth.id",
  },
  schedules: {
    listRule: "house.members.id ?= @request.auth.id",
    viewRule: "house.members.id ?= @request.auth.id",
    createRule:
      "@request.body.house.members.id ?= @request.auth.id && @request.body.scene.house = @request.body.house && " +
      "@request.body.last_run:isset = false && @request.body.last_error:isset = false",
    updateRule:
      "house.members.id ?= @request.auth.id && @request.body.house:isset = false && " +
      "(@request.body.scene:isset = false || @request.body.scene.house = house) && " +
      "@request.body.last_run:isset = false && @request.body.last_error:isset = false",
    deleteRule: "house.members.id ?= @request.auth.id",
  },
  rooms: {
    listRule: "house.members.id ?= @request.auth.id",
    viewRule: "house.members.id ?= @request.auth.id",
    createRule: "@request.body.house.members.id ?= @request.auth.id",
    updateRule: "house.members.id ?= @request.auth.id",
    deleteRule: "house.members.id ?= @request.auth.id",
  },
}

// Extra voorwaarden op de bewonerstak (binnen de USERS-wrapper).
const EXTRA_OLD = { houses: { updateRule: forbid(["claimed_at"]) } }
const EXTRA_NEW = {
  houses: { updateRule: forbid(["members", "admins", "weather", "weather_updated", "claimed_at"]) },
}

// Box-takken: precies zoals in 1790730000, behalve houses.updateRule.
const boxSpec = (houseForbid) => ({
  houses: {
    listRule: BOX + " && id = " + H,
    viewRule: BOX + " && id = " + H,
    updateRule: BOX + " && id = " + H + " && " + forbid(houseForbid),
  },
  devices: {
    listRule: BOX + " && gateway = " + H,
    viewRule: BOX + " && gateway = " + H,
    updateRule:
      BOX + " && gateway = " + H + " && " +
      forbid(["gateway", "name", "type", "room", "favorite", "favorite_order"]),
  },
  device_state: {
    listRule: BOX + " && device.gateway = " + H,
    viewRule: BOX + " && device.gateway = " + H,
    createRule: BOX + " && @request.body.device.gateway = " + H,
    updateRule: BOX + " && device.gateway = " + H + " && " + forbid(["device"]),
  },
  commands: {
    listRule: BOX + " && (device.gateway = " + H + " || scene.house = " + H + ")",
    viewRule: BOX + " && (device.gateway = " + H + " || scene.house = " + H + ")",
    updateRule:
      BOX + " && (device.gateway = " + H + " || scene.house = " + H + ") && " +
      forbid(["device", "scene", "action", "payload"]),
  },
  scenes: {
    listRule: BOX + " && house = " + H,
    viewRule: BOX + " && house = " + H,
  },
  schedules: {
    listRule: BOX + " && house = " + H,
    viewRule: BOX + " && house = " + H,
    updateRule: BOX + " && house = " + H + " && " + forbid(["house", "scene", "time", "days", "enabled"]),
  },
  rooms: {},
})
const BOX_OLD = boxSpec(["user", "name", "claimed_at"])
const BOX_NEW = boxSpec(["members", "admins", "name", "claimed_at"])

const RULES = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]

// zelfde samenvoeging als 1790710000 en 1790730000
const wrap = (res, box) => {
  if (!box) return res
  if (res === null || res === undefined) return box
  return "(" + res + ") || (" + box + ")"
}

const usersOnly = (res, extra) => {
  if (res === null) return null
  return USERS + " && (" + res + (extra ? " && " + extra : "") + ")"
}

const build = (res, extra, box) => (name, r) => wrap(usersOnly(res[name][r], (extra[name] || {})[r]), box[name][r])

const oldRule = build(RES_OLD, EXTRA_OLD, BOX_OLD)
const newRule = build(RES_NEW, EXTRA_NEW, BOX_NEW)

migrate((app) => {
  // Eerst alle regels controleren, vóór er iets verandert.
  for (const name of Object.keys(RES_OLD)) {
    const c = app.findCollectionByNameOrId(name)
    for (const r of RULES) {
      const want = oldRule(name, r)
      // c[r] is een Go-*string; als JS-waarde vergelijken
      const have = c[r] === null || c[r] === undefined ? null : String(c[r])
      if (have !== want) {
        throw new Error(name + "." + r + " wijkt af van de verwachte regel; pas deze migratie aan. Huidig: " + have)
      }
    }
  }

  const users = app.findCollectionByNameOrId("users")
  const houses = app.findCollectionByNameOrId("houses")
  for (const f of ["members", "admins"]) {
    houses.fields.add(new RelationField({
      name: f, collectionId: users.id, cascadeDelete: false, maxSelect: MAX_MEMBERS,
    }))
  }
  app.save(houses)

  for (const h of app.findAllRecords("houses")) {
    const u = h.getString("user")
    if (!u) continue
    h.set("members", [u])
    h.set("admins", [u])
    app.saveNoValidate(h)
  }

  for (const name of Object.keys(RES_OLD)) {
    const c = app.findCollectionByNameOrId(name)
    for (const r of RULES) c[r] = newRule(name, r)
    if (name === "houses") c.fields.removeByName("user")
    app.save(c)
  }
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  const houses = app.findCollectionByNameOrId("houses")
  houses.fields.add(new RelationField({ name: "user", collectionId: users.id, cascadeDelete: false, maxSelect: 1 }))
  app.save(houses)

  for (const h of app.findAllRecords("houses")) {
    const admins = h.getStringSlice("admins")
    if (admins.length === 0) continue
    h.set("user", admins[0])
    app.saveNoValidate(h)
  }

  for (const name of Object.keys(RES_OLD)) {
    const c = app.findCollectionByNameOrId(name)
    for (const r of RULES) c[r] = oldRule(name, r)
    if (name === "houses") {
      c.fields.removeByName("members")
      c.fields.removeByName("admins")
    }
    app.save(c)
  }
})
