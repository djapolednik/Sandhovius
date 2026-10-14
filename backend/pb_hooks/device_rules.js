// Controle op devices, gedeeld door devices.pb.js (PocketBase draait elke hook
// in een eigen context; gedeelde code gaat via require). De regels kunnen niet
// in JSON kijken: de box zet de mogelijkheden uit een vaste woordenlijst, en
// "weergeven als lamp" (shown_as) kan alleen bij een stekker
// (spec 2026-10-14-device-pairing-design.md). De superuser (beheer, tests)
// slaat de controle over.
const CAPABILITIES = [
  "onoff", "brightness", "color_temp", "color", "heating", "valve", "occupancy", "contact",
  "water_leak", "smoke", "temperature", "humidity", "illuminance", "battery",
]

function check(e) {
  if (e.hasSuperuserAuth()) return e.next()
  const refuse = (code) => e.json(400, { status: 400, code: code, params: {}, message: code, data: {} })

  const raw = e.record.getString("capabilities")
  if (raw !== "" && raw !== "null") {
    let caps = null
    try {
      caps = JSON.parse(raw)
    } catch (_) {}
    if (!Array.isArray(caps) || !caps.every((c) => typeof c === "string" && CAPABILITIES.includes(c))) {
      return refuse("invalid_capabilities")
    }
  }

  if (e.record.getString("shown_as") !== "" && e.record.getString("type") !== "switch") {
    return refuse("invalid_shown_as")
  }
  return e.next()
}

module.exports = { check, CAPABILITIES }
