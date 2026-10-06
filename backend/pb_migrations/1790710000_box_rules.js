/// <reference path="../pb_data/types.d.ts" />
// Regels voor de box: een box (auth-collectie "boxes") bereikt alleen zijn eigen
// huis (@request.auth.house) en schrijft alleen de velden die de agent echt nodig
// heeft. De bestaande bewonersregels blijven staan; de box-tak komt erbij met
// "(<bestaand>) || (<box>)". De regels worden bij het draaien uit de collectie
// gelezen en omwikkeld, zodat latere aanpassingen van bewonersregels niet
// worden overschreven.
//
// BOX = alleen een box; H = het huis van die box. Een box zonder huis (H leeg)
// matcht nergens: "H != ''" staat expliciet in elke tak, want een lege relatie
// (device zonder gateway, scène-commando zonder device) is anders gelijk aan
// een lege H.
//
// Realtime volgt dezelfde list/view-regels: een box krijgt alleen events van
// zijn eigen huis. Verboden velden zijn een zwarte lijst op basis van het schema
// in git; de regeltest (backend/tests/rules_test.go) probeert elk veld dat niet
// op de toegestane lijst staat, ook velden die later worden toegevoegd.
const BOX = '@request.auth.collectionName = "boxes" && @request.auth.house != ""'
const H = "@request.auth.house"

const forbid = (fields) => fields.map((f) => "@request.body." + f + ":isset = false").join(" && ")

// Per collectie: box-takken (null = geen box-tak) en de originele bewonersregels
// zoals ze vóór deze migratie waren, voor "down".
const SPEC = {
  houses: {
    list: BOX + " && id = " + H,
    view: BOX + " && id = " + H,
    update: BOX + " && id = " + H + " && " + forbid(["user", "name", "claimed_at"]),
    orig: {
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: null,
      updateRule:
        "user = @request.auth.id && @request.body.weather:isset = false && @request.body.weather_updated:isset = false",
      deleteRule: null,
    },
  },
  devices: {
    list: BOX + " && gateway = " + H,
    view: BOX + " && gateway = " + H,
    update:
      BOX + " && gateway = " + H + " && " +
      forbid(["gateway", "name", "type", "room", "favorite", "favorite_order"]),
    orig: {
      listRule: "gateway.user = @request.auth.id",
      viewRule: "gateway.user = @request.auth.id",
      createRule: "@request.body.gateway.user = @request.auth.id",
      updateRule: "gateway.user = @request.auth.id",
      deleteRule: "gateway.user = @request.auth.id",
    },
  },
  device_state: {
    list: BOX + " && device.gateway = " + H,
    view: BOX + " && device.gateway = " + H,
    create: BOX + " && @request.body.device.gateway = " + H,
    update: BOX + " && device.gateway = " + H + " && " + forbid(["device"]),
    orig: {
      listRule: "device.gateway.user = @request.auth.id",
      viewRule: "device.gateway.user = @request.auth.id",
      createRule: null,
      updateRule: null,
      deleteRule: null,
    },
  },
  commands: {
    list: BOX + " && (device.gateway = " + H + " || scene.house = " + H + ")",
    view: BOX + " && (device.gateway = " + H + " || scene.house = " + H + ")",
    update:
      BOX + " && (device.gateway = " + H + " || scene.house = " + H + ") && " +
      forbid(["device", "scene", "action", "payload"]),
    orig: {
      listRule: "(device.gateway.user = @request.auth.id || scene.house.user = @request.auth.id)",
      viewRule: "(device.gateway.user = @request.auth.id || scene.house.user = @request.auth.id)",
      createRule:
        'status = "pending" && (' +
        '(action != "run_scene" && scene = "" && device.gateway.user = @request.auth.id) || ' +
        '(action = "run_scene" && device = "" && scene.house.user = @request.auth.id))',
      updateRule: null,
      deleteRule: null,
    },
  },
  scenes: {
    list: BOX + " && house = " + H,
    view: BOX + " && house = " + H,
    orig: {
      listRule: "house.user = @request.auth.id",
      viewRule: "house.user = @request.auth.id",
      createRule: "@request.body.house.user = @request.auth.id",
      updateRule: "house.user = @request.auth.id && @request.body.house:isset = false",
      deleteRule: "house.user = @request.auth.id",
    },
  },
  schedules: {
    list: BOX + " && house = " + H,
    view: BOX + " && house = " + H,
    update: BOX + " && house = " + H + " && " + forbid(["house", "scene", "time", "days", "enabled"]),
    orig: {
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
  },
}

// Oude regel + box-tak; een lege (null) regel is "alleen superuser", dan blijft
// alleen de box-tak over.
const wrap = (old, box) => {
  if (!box) return old
  if (old === null || old === undefined) return box
  return "(" + old + ") || (" + box + ")"
}

migrate((app) => {
  for (const name of Object.keys(SPEC)) {
    const s = SPEC[name]
    const c = app.findCollectionByNameOrId(name)
    c.listRule = wrap(c.listRule, s.list)
    c.viewRule = wrap(c.viewRule, s.view)
    c.createRule = wrap(c.createRule, s.create)
    c.updateRule = wrap(c.updateRule, s.update)
    app.save(c)
  }
}, (app) => {
  for (const name of Object.keys(SPEC)) {
    const c = app.findCollectionByNameOrId(name)
    Object.assign(c, SPEC[name].orig)
    app.save(c)
  }
})
