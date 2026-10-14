// Controle op automations (routines), gedeeld door automations.pb.js. De
// regels kunnen niet in JSON kijken; hier staat de gesloten lijst
// (spec 2026-10-14-routines-design.md). Dezelfde lijst controleert de agent.
// De superuser (beheer, tests) slaat de controle over; de box schrijft alleen
// last_run/last_error/next_run en wordt niet opnieuw gecontroleerd.
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
const OFF_AFTER = [0, 1, 5, 15, 30, 60]
const MAX_ACTIONS = 10
// Welke mogelijkheid een sensor nodig heeft voor een gebeurtenis.
const SENSOR_EVENTS = {
  motion: "occupancy", no_motion: "occupancy", open: "contact", closed: "contact",
  leak: "water_leak", smoke: "smoke", above: "temperature", below: "temperature",
}
const SWITCHABLE = ["light", "switch"]
// Thuis/weg (B3): voor het hele huis, of per lid (dan met user).
const PRESENCE_HOUSE_EVENTS = ["first_home", "all_away"]
const PRESENCE_USER_EVENTS = ["arrives", "leaves"]
const PRESENCE_HOUSE_STATES = ["someone_home", "nobody_home"]
const PRESENCE_USER_STATES = ["home", "away"]

function parse(record, field) {
  const raw = record.getString(field)
  if (raw === "" || raw === "null") return null
  try {
    return JSON.parse(raw)
  } catch (_) {
    return undefined
  }
}

function isDays(days) {
  return Array.isArray(days) && days.length > 0 && days.every((d) => DAYS.includes(d))
}

function check(e) {
  if (e.hasSuperuserAuth()) return e.next()
  if (e.auth && e.auth.collection().name === "boxes") return e.next()
  const refuse = (part) =>
    e.json(400, { status: 400, code: "invalid_automation", params: { part: part }, message: "invalid_automation: " + part, data: {} })

  const house = e.record.getString("house")
  const device = (id) => {
    if (typeof id !== "string" || id === "") return null
    try {
      const d = e.app.findRecordById("devices", id)
      return d.getString("gateway") === house ? d : null
    } catch (_) {
      return null
    }
  }
  // Een lid van dit huis (voor thuis/weg per persoon).
  const isMember = (id) => {
    if (typeof id !== "string" || id === "") return false
    try {
      return e.app.findRecordById("houses", house).getStringSlice("members").includes(id)
    } catch (_) {
      return false
    }
  }
  const presenceOk = (houseValues, userValues, value, user) =>
    (houseValues.includes(value) && (user === undefined || user === null || user === "")) ||
    (userValues.includes(value) && isMember(user))
  const caps = (d) => {
    try {
      return JSON.parse(d.getString("capabilities")) || []
    } catch (_) {
      return []
    }
  }

  // Starter: precies één.
  const s = parse(e.record, "starter")
  if (!s || typeof s !== "object") return refuse("starter")
  if (s.kind === "time") {
    if (!TIME.test(s.time || "") || !isDays(s.days)) return refuse("starter")
  } else if (s.kind === "sun") {
    if (!["sunrise", "sunset"].includes(s.event) || !isDays(s.days)) return refuse("starter")
    const off = s.offset_min ?? 0
    if (!Number.isInteger(off) || off < -120 || off > 120) return refuse("starter")
  } else if (s.kind === "device") {
    const d = device(s.device)
    if (!d || !SWITCHABLE.includes(d.getString("type")) || !["on", "off"].includes(s.to)) return refuse("starter")
  } else if (s.kind === "sensor") {
    const d = device(s.device)
    const need = SENSOR_EVENTS[s.event]
    if (!d || d.getString("type") !== "sensor" || !need || !caps(d).includes(need)) return refuse("starter")
    if (s.event === "above" || s.event === "below") {
      if (typeof s.value !== "number" || s.value < 0 || s.value > 40) return refuse("starter")
    }
  } else if (s.kind === "presence") {
    if (!presenceOk(PRESENCE_HOUSE_EVENTS, PRESENCE_USER_EVENTS, s.event, s.user)) return refuse("starter")
  } else {
    return refuse("starter")
  }

  // Voorwaarden: nul of meer.
  const conditions = parse(e.record, "conditions") ?? []
  if (!Array.isArray(conditions) || conditions.length > 5) return refuse("conditions")
  for (const c of conditions) {
    if (!c || typeof c !== "object") return refuse("conditions")
    if (c.kind === "dark") continue
    if (c.kind === "between" && TIME.test(c.from || "") && TIME.test(c.to || "") && c.from !== c.to) continue
    if (c.kind === "days" && isDays(c.days)) continue
    if (c.kind === "presence" && presenceOk(PRESENCE_HOUSE_STATES, PRESENCE_USER_STATES, c.state, c.user)) continue
    return refuse("conditions")
  }

  // Acties: een of meer, op volgorde.
  const actions = parse(e.record, "actions")
  if (!Array.isArray(actions) || actions.length === 0 || actions.length > MAX_ACTIONS) return refuse("actions")
  for (const a of actions) {
    if (!a || typeof a !== "object") return refuse("actions")
    if (a.kind === "scene") {
      try {
        const scene = e.app.findRecordById("scenes", a.scene)
        if (scene.getString("house") !== house) return refuse("actions")
      } catch (_) {
        return refuse("actions")
      }
      continue
    }
    // Een klimaatstand (F2): één thermostaat van het huis, of leeg = alle.
    if (a.kind === "climate") {
      if (!["comfort", "eco", "sleep"].includes(a.preset)) return refuse("actions")
      if (a.device !== undefined && a.device !== null && a.device !== "") {
        const d = device(a.device)
        if (!d || d.getString("type") !== "climate") return refuse("actions")
      }
      continue
    }
    // Een melding (B2): een korte tekst, aan leden van het huis (leeg = iedereen).
    if (a.kind === "notify") {
      const text = typeof a.text === "string" ? a.text.trim() : ""
      const users = a.users ?? []
      if (text === "" || text.length > 80 || !Array.isArray(users) || users.length > 20) return refuse("actions")
      if (!users.every((u) => isMember(u))) return refuse("actions")
      continue
    }
    if (a.kind !== "device") return refuse("actions")
    const d = device(a.device)
    if (!d || !SWITCHABLE.includes(d.getString("type")) || !["turn_on", "turn_off"].includes(a.action)) {
      return refuse("actions")
    }
    if (a.payload !== undefined && a.payload !== null) {
      if (a.action !== "turn_on" || d.getString("type") !== "light" || typeof a.payload !== "object") return refuse("actions")
      for (const [key, value] of Object.entries(a.payload)) {
        const ok =
          (key === "brightness_pct" && Number.isInteger(value) && value >= 1 && value <= 100) ||
          (key === "color_temp_kelvin" && Number.isInteger(value) && value >= 1500 && value <= 9000)
        if (!ok) return refuse("actions")
      }
    }
  }

  if (!OFF_AFTER.includes(e.record.getInt("off_after"))) return refuse("off_after")
  return e.next()
}

module.exports = { check }
