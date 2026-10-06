/// <reference path="../pb_data/types.d.ts" />
// Bewonersregels alleen voor bewoners. Voor een gast (geen token) is
// @request.auth.id leeg, en dat is gelijk aan een lege relatie: "user =
// @request.auth.id" matchte dus elk huis zonder eigenaar. Een gast kon zo'n
// huis zien, aan zichzelf koppelen (PATCH user) en de kamers, scènes en
// devices ervan lezen; "scene.house.user = @request.auth.id" liet een gast
// zelfs alle device-commando's zien (lege scène). Elke bewonerstak begint nu
// met @request.auth.collectionName = "users". Dat sluit ook een theoretische
// botsing tussen een box-id en een user-id uit. De box-takken blijven precies
// zoals in 1790710000.
//
// Ook: een bewoner mag houses.claimed_at niet zetten; dat hoort bij het claimen
// van een box (superuser), niet bij hernoemen.
//
// De regels zijn hier volledig uitgeschreven (oud = stand na 1790710000). "up"
// controleert eerst dat de huidige regels precies "oud" zijn en stopt anders,
// zodat een latere handmatige wijziging niet stilletjes wordt overschreven.
const BOX = '@request.auth.collectionName = "boxes" && @request.auth.house != ""'
const H = "@request.auth.house"
const USERS = '@request.auth.collectionName = "users"'

const forbid = (fields) => fields.map((f) => "@request.body." + f + ":isset = false").join(" && ")

// Per collectie: bewonersregels (vóór 1790710000) en box-takken uit 1790710000.
const SPEC = {
  houses: {
    res: {
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: null,
      updateRule:
        "user = @request.auth.id && @request.body.weather:isset = false && @request.body.weather_updated:isset = false",
      deleteRule: null,
    },
    extra: { updateRule: forbid(["claimed_at"]) },
    box: {
      listRule: BOX + " && id = " + H,
      viewRule: BOX + " && id = " + H,
      updateRule: BOX + " && id = " + H + " && " + forbid(["user", "name", "claimed_at"]),
    },
  },
  devices: {
    res: {
      listRule: "gateway.user = @request.auth.id",
      viewRule: "gateway.user = @request.auth.id",
      createRule: "@request.body.gateway.user = @request.auth.id",
      updateRule: "gateway.user = @request.auth.id",
      deleteRule: "gateway.user = @request.auth.id",
    },
    box: {
      listRule: BOX + " && gateway = " + H,
      viewRule: BOX + " && gateway = " + H,
      updateRule:
        BOX + " && gateway = " + H + " && " +
        forbid(["gateway", "name", "type", "room", "favorite", "favorite_order"]),
    },
  },
  device_state: {
    res: {
      listRule: "device.gateway.user = @request.auth.id",
      viewRule: "device.gateway.user = @request.auth.id",
      createRule: null,
      updateRule: null,
      deleteRule: null,
    },
    box: {
      listRule: BOX + " && device.gateway = " + H,
      viewRule: BOX + " && device.gateway = " + H,
      createRule: BOX + " && @request.body.device.gateway = " + H,
      updateRule: BOX + " && device.gateway = " + H + " && " + forbid(["device"]),
    },
  },
  commands: {
    res: {
      listRule: "(device.gateway.user = @request.auth.id || scene.house.user = @request.auth.id)",
      viewRule: "(device.gateway.user = @request.auth.id || scene.house.user = @request.auth.id)",
      createRule:
        'status = "pending" && (' +
        '(action != "run_scene" && scene = "" && device.gateway.user = @request.auth.id) || ' +
        '(action = "run_scene" && device = "" && scene.house.user = @request.auth.id))',
      updateRule: null,
      deleteRule: null,
    },
    box: {
      listRule: BOX + " && (device.gateway = " + H + " || scene.house = " + H + ")",
      viewRule: BOX + " && (device.gateway = " + H + " || scene.house = " + H + ")",
      updateRule:
        BOX + " && (device.gateway = " + H + " || scene.house = " + H + ") && " +
        forbid(["device", "scene", "action", "payload"]),
    },
  },
  scenes: {
    res: {
      listRule: "house.user = @request.auth.id",
      viewRule: "house.user = @request.auth.id",
      createRule: "@request.body.house.user = @request.auth.id",
      updateRule: "house.user = @request.auth.id && @request.body.house:isset = false",
      deleteRule: "house.user = @request.auth.id",
    },
    box: {
      listRule: BOX + " && house = " + H,
      viewRule: BOX + " && house = " + H,
    },
  },
  schedules: {
    res: {
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
    box: {
      listRule: BOX + " && house = " + H,
      viewRule: BOX + " && house = " + H,
      updateRule: BOX + " && house = " + H + " && " + forbid(["house", "scene", "time", "days", "enabled"]),
    },
  },
  rooms: {
    res: {
      listRule: "house.user = @request.auth.id",
      viewRule: "house.user = @request.auth.id",
      createRule: "@request.body.house.user = @request.auth.id",
      updateRule: "house.user = @request.auth.id",
      deleteRule: "house.user = @request.auth.id",
    },
    box: {},
  },
}

const RULES = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]

// zelfde samenvoeging als 1790710000
const wrap = (res, box) => {
  if (!box) return res
  if (res === null || res === undefined) return box
  return "(" + res + ") || (" + box + ")"
}

const usersOnly = (res, extra) => {
  if (res === null) return null
  return USERS + " && (" + res + (extra ? " && " + extra : "") + ")"
}

const oldRule = (s, r) => wrap(s.res[r], s.box[r])
const newRule = (s, r) => wrap(usersOnly(s.res[r], (s.extra || {})[r]), s.box[r])

migrate((app) => {
  for (const name of Object.keys(SPEC)) {
    const c = app.findCollectionByNameOrId(name)
    for (const r of RULES) {
      const want = oldRule(SPEC[name], r)
      // c[r] is een Go-*string; als JS-waarde vergelijken
      const have = c[r] === null || c[r] === undefined ? null : String(c[r])
      if (have !== want) {
        throw new Error(name + "." + r + " wijkt af van de verwachte regel; pas deze migratie aan. Huidig: " + have)
      }
      c[r] = newRule(SPEC[name], r)
    }
    app.save(c)
  }
}, (app) => {
  for (const name of Object.keys(SPEC)) {
    const c = app.findCollectionByNameOrId(name)
    for (const r of RULES) c[r] = oldRule(SPEC[name], r)
    app.save(c)
  }
})
