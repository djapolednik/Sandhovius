/// <reference path="../pb_data/types.d.ts" />
// Een bewoner hangt geen apparaat of kamer aan een ander huis. Met
// huisgenoten kan iemand lid zijn van twee huizen; zonder deze regel kon die
// een apparaat van huis A naar B verplaatsen (weg voor iedereen in A, en de box
// van B krijgt commando's voor een apparaat dat hij niet kent).
//
// - devices: gateway niet wijzigen; een kamer moet van hetzelfde huis zijn
//   (of leeg), ook bij aanmaken.
// - rooms: house niet wijzigen.
//
// "up" controleert eerst dat de regels precies de stand na 1790770000 zijn en
// stopt anders.
const BOX = '@request.auth.collectionName = "boxes" && @request.auth.house != ""'
const H = "@request.auth.house"
const USERS = '@request.auth.collectionName = "users"'
const forbid = (fields) => fields.map((f) => "@request.body." + f + ":isset = false").join(" && ")
const DEVICE_BOX = "(" + BOX + " && gateway = " + H + " && " + forbid(["gateway", "name", "type", "room"]) + ")"

const ROOM_SAME_HOUSE = (house) =>
  '(@request.body.room:isset = false || @request.body.room = "" || @request.body.room.house = ' + house + ")"

const RULES = {
  devices: {
    updateRule: {
      old: "(" + USERS + " && (gateway.members.id ?= @request.auth.id)) || " + DEVICE_BOX,
      new:
        "(" + USERS + " && (gateway.members.id ?= @request.auth.id && " + forbid(["gateway"]) + " && " +
        ROOM_SAME_HOUSE("gateway") + ")) || " + DEVICE_BOX,
    },
    createRule: {
      old: USERS + " && (@request.body.gateway.members.id ?= @request.auth.id)",
      new: USERS + " && (@request.body.gateway.members.id ?= @request.auth.id && " + ROOM_SAME_HOUSE("@request.body.gateway") + ")",
    },
  },
  rooms: {
    updateRule: {
      old: USERS + " && (house.members.id ?= @request.auth.id)",
      new: USERS + " && (house.members.id ?= @request.auth.id && " + forbid(["house"]) + ")",
    },
  },
}

const apply = (app, from, to) => {
  for (const name of Object.keys(RULES)) {
    const c = app.findCollectionByNameOrId(name)
    for (const r of Object.keys(RULES[name])) {
      const have = c[r] === null || c[r] === undefined ? null : String(c[r])
      if (have !== RULES[name][r][from]) {
        throw new Error(name + "." + r + " wijkt af van de verwachte regel; pas deze migratie aan. Huidig: " + have)
      }
    }
  }
  for (const name of Object.keys(RULES)) {
    const c = app.findCollectionByNameOrId(name)
    for (const r of Object.keys(RULES[name])) c[r] = RULES[name][r][to]
    app.save(c)
  }
}

migrate((app) => apply(app, "old", "new"), (app) => apply(app, "new", "old"))
