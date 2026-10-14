/// <reference path="../pb_data/types.d.ts" />
// Koppelen (spec 2026-10-14-device-pairing-design.md): een lid opent een
// pairing_session in zijn huis, de box schrijft wat hij vindt als
// pairing_candidates, het lid kiest, geeft een naam en kamer, en de box maakt
// het device.
//
// - pairing_sessions: een lid maakt hem aan als "starting", mag hem sluiten,
//   verlengen (extend) en bij Hue melden dat de knop is ingedrukt; de box zet
//   status, expires en error. Eén open sessie per huis bewaakt pairing.pb.js,
//   dat ook created_by zet.
// - pairing_candidates: alleen de box maakt ze; een lid zet identify, name,
//   room (uit hetzelfde huis) en add; de box de rest.
migrate(
  (app) => {
    const houses = app.findCollectionByNameOrId("houses")
    const users = app.findCollectionByNameOrId("users")
    const rooms = app.findCollectionByNameOrId("rooms")
    const devices = app.findCollectionByNameOrId("devices")

    const USERS = '@request.auth.collectionName = "users"'
    const BOX = '@request.auth.collectionName = "boxes" && @request.auth.house != ""'
    const H = "@request.auth.house"
    const forbid = (fields) => fields.map((f) => "@request.body." + f + ":isset = false").join(" && ")

    const sessions = new Collection({
      type: "base",
      name: "pairing_sessions",
      listRule: `(${USERS} && house.members.id ?= @request.auth.id) || (${BOX} && house = ${H})`,
      viewRule: `(${USERS} && house.members.id ?= @request.auth.id) || (${BOX} && house = ${H})`,
      createRule:
        `${USERS} && @request.body.house.members.id ?= @request.auth.id && @request.body.status = "starting" && ` +
        forbid(["expires", "error", "extend", "button_pressed"]),
      updateRule:
        `(${USERS} && house.members.id ?= @request.auth.id && ` +
        forbid(["house", "kind", "expires", "error", "created_by"]) +
        ` && (@request.body.status:isset = false || @request.body.status = "closed")) || ` +
        `(${BOX} && house = ${H} && ` + forbid(["house", "kind", "created_by"]) + ")",
      deleteRule: null,
      fields: [
        { type: "relation", name: "house", required: true, collectionId: houses.id, cascadeDelete: true, maxSelect: 1 },
        { type: "select", name: "kind", required: true, values: ["light", "switch", "sensor", "climate", "hue"], maxSelect: 1 },
        {
          type: "select", name: "status", required: true,
          values: ["starting", "open", "waiting_button", "closed", "failed"], maxSelect: 1,
        },
        { type: "date", name: "expires" },
        { type: "text", name: "error" },
        { type: "relation", name: "created_by", collectionId: users.id, cascadeDelete: false, maxSelect: 1 },
        { type: "bool", name: "extend" },
        { type: "bool", name: "button_pressed" },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
    })
    app.save(sessions)

    const candidates = new Collection({
      type: "base",
      name: "pairing_candidates",
      listRule: `(${USERS} && session.house.members.id ?= @request.auth.id) || (${BOX} && session.house = ${H})`,
      viewRule: `(${USERS} && session.house.members.id ?= @request.auth.id) || (${BOX} && session.house = ${H})`,
      createRule: `${BOX} && @request.body.session.house = ${H}`,
      updateRule:
        `(${USERS} && session.house.members.id ?= @request.auth.id && ` +
        forbid(["session", "source", "address", "endpoint", "type", "capabilities", "model", "status", "device"]) +
        ' && (@request.body.room:isset = false || @request.body.room = "" || @request.body.room.house = session.house)) || ' +
        `(${BOX} && session.house = ${H} && ` + forbid(["session", "identify", "name", "room", "add"]) + ")",
      deleteRule: null,
      fields: [
        { type: "relation", name: "session", required: true, collectionId: sessions.id, cascadeDelete: true, maxSelect: 1 },
        { type: "select", name: "source", values: ["zigbee", "hue"], maxSelect: 1 },
        { type: "text", name: "address" },
        { type: "text", name: "endpoint" },
        { type: "select", name: "type", values: ["light", "switch", "sensor", "climate"], maxSelect: 1 },
        { type: "json", name: "capabilities", maxSize: 2000 },
        { type: "text", name: "model" },
        {
          type: "select", name: "status", required: true,
          values: ["interviewing", "found", "unsupported", "adding", "added", "failed"], maxSelect: 1,
        },
        { type: "number", name: "identify", onlyInt: true, min: 0 },
        { type: "text", name: "name", max: 60 },
        { type: "relation", name: "room", collectionId: rooms.id, cascadeDelete: false, maxSelect: 1 },
        { type: "bool", name: "add" },
        { type: "relation", name: "device", collectionId: devices.id, cascadeDelete: false, maxSelect: 1 },
        { type: "autodate", name: "created", onCreate: true },
        { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
      ],
    })
    app.save(candidates)

    const settings = app.settings()
    settings.rateLimits.rules.push({ label: "pairing_sessions:create", audience: "@auth", duration: 60, maxRequests: 10 })
    app.save(settings)
  },
  (app) => {
    const settings = app.settings()
    settings.rateLimits.rules = settings.rateLimits.rules.filter((r) => r.label !== "pairing_sessions:create")
    app.save(settings)
    app.delete(app.findCollectionByNameOrId("pairing_candidates"))
    app.delete(app.findCollectionByNameOrId("pairing_sessions"))
  },
)
