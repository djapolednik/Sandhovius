/// <reference path="../pb_data/types.d.ts" />
// Device-identiteit en koppelen (spec 2026-10-14-device-pairing-design.md).
//
// - devices krijgt source, address, endpoint, capabilities, model (door de box
//   geschreven) en shown_as (door de bewoner: een stekker als lamp tonen).
// - Alleen de box maakt een device, in zijn eigen huis: na koppelen in de app.
//   Een bewoner maakt geen devices meer (geen neplamp per ongeluk) en wijzigt
//   alleen naam, kamer en weergave.
// - commands.action: "provision" (virtuele helper klaarzetten) weg,
//   "identify" (laten knipperen) erbij.
// - Harde overgang: alle bestaande devices en commando's gaan weg (er zijn
//   alleen dev-data: helpers en nep-lampen), scènes houden hun naam maar geen
//   stappen. Cascade neemt device_state, favorieten en bewegingslichten mee.
//
// "up" controleert eerst dat de regels precies de stand na 1790790000 zijn en
// stopt anders. "down" zet velden en regels terug, niet de verwijderde data.
const BOX = '@request.auth.collectionName = "boxes" && @request.auth.house != ""'
const H = "@request.auth.house"
const USERS = '@request.auth.collectionName = "users"'
const forbid = (fields) => fields.map((f) => "@request.body." + f + ":isset = false").join(" && ")
const ROOM_SAME_HOUSE = (house) =>
  '(@request.body.room:isset = false || @request.body.room = "" || @request.body.room.house = ' + house + ")"

const BOX_FIELDS = ["source", "address", "endpoint", "capabilities", "model"]

const RULES = {
  updateRule: {
    old:
      "(" + USERS + " && (gateway.members.id ?= @request.auth.id && " + forbid(["gateway"]) + " && " +
      ROOM_SAME_HOUSE("gateway") + ")) || " +
      "(" + BOX + " && gateway = " + H + " && " + forbid(["gateway", "name", "type", "room"]) + ")",
    new:
      "(" + USERS + " && (gateway.members.id ?= @request.auth.id && " +
      forbid(["gateway", "type", "entity_id", "online"].concat(BOX_FIELDS)) + " && " +
      ROOM_SAME_HOUSE("gateway") + ")) || " +
      "(" + BOX + " && gateway = " + H + " && " + forbid(["gateway", "name", "type", "room", "shown_as"]) + ")",
  },
  createRule: {
    old: USERS + " && (@request.body.gateway.members.id ?= @request.auth.id && " + ROOM_SAME_HOUSE("@request.body.gateway") + ")",
    new: BOX + " && @request.body.gateway = " + H + " && " + forbid(["shown_as"]) + " && " + ROOM_SAME_HOUSE("@request.body.gateway"),
  },
}

const ACTIONS_OLD = ["turn_on", "turn_off", "toggle", "set_temperature", "provision", "run_scene"]
const ACTIONS_NEW = ["turn_on", "turn_off", "toggle", "set_temperature", "run_scene", "identify"]

const checkRules = (c, from) => {
  for (const r of Object.keys(RULES)) {
    const have = c[r] === null || c[r] === undefined ? null : String(c[r])
    if (have !== RULES[r][from]) {
      throw new Error("devices." + r + " wijkt af van de verwachte regel; pas deze migratie aan. Huidig: " + have)
    }
  }
}

migrate(
  (app) => {
    const devices = app.findCollectionByNameOrId("devices")
    checkRules(devices, "old")

    // eerst de data: oude commando's (provision) en devices weg, scènes leeg
    for (const r of app.findAllRecords("commands")) app.delete(r)
    for (const r of app.findAllRecords("devices")) app.delete(r)
    for (const r of app.findAllRecords("scenes")) {
      r.set("actions", [])
      app.save(r)
    }

    devices.fields.add(new SelectField({ name: "source", values: ["zigbee", "hue"], maxSelect: 1 }))
    devices.fields.add(new TextField({ name: "address" }))
    devices.fields.add(new TextField({ name: "endpoint" }))
    devices.fields.add(new JSONField({ name: "capabilities", maxSize: 2000 }))
    devices.fields.add(new TextField({ name: "model" }))
    devices.fields.add(new SelectField({ name: "shown_as", values: ["light"], maxSelect: 1 }))
    for (const r of Object.keys(RULES)) devices[r] = RULES[r]["new"]
    app.save(devices)

    const commands = app.findCollectionByNameOrId("commands")
    commands.fields.getByName("action").values = ACTIONS_NEW
    app.save(commands)
  },
  (app) => {
    const devices = app.findCollectionByNameOrId("devices")
    checkRules(devices, "new")
    for (const name of BOX_FIELDS.concat(["shown_as"])) devices.fields.removeByName(name)
    for (const r of Object.keys(RULES)) devices[r] = RULES[r]["old"]
    app.save(devices)

    for (const r of app.findAllRecords("commands", $dbx.hashExp({ action: "identify" }))) app.delete(r)
    const commands = app.findCollectionByNameOrId("commands")
    commands.fields.getByName("action").values = ACTIONS_OLD
    app.save(commands)
  },
)
