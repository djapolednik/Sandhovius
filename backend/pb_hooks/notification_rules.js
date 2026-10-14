// Controle op notification_rules (Meld dit, spec
// 2026-10-14-notifications-design.md), gedeeld door notifications.pb.js. De
// sensor hoort bij het huis en kan de gebeurtenis meten; van/tot allebei leeg
// (altijd) of allebei een tijd die niet gelijk is. De superuser slaat de
// controle over.
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const NEEDS = { open: "contact", motion: "occupancy" }

function check(e) {
  if (e.hasSuperuserAuth()) return e.next()
  const refuse = () =>
    e.json(400, { status: 400, code: "invalid_notification_rule", params: {}, message: "invalid_notification_rule", data: {} })

  let device = null
  try {
    device = e.app.findRecordById("devices", e.record.getString("device"))
  } catch (_) {}
  if (!device || device.getString("gateway") !== e.record.getString("house") || device.getString("type") !== "sensor") {
    return refuse()
  }
  let caps = []
  try {
    caps = JSON.parse(device.getString("capabilities")) || []
  } catch (_) {}
  if (!caps.includes(NEEDS[e.record.getString("event")])) return refuse()

  const from = e.record.getString("from")
  const to = e.record.getString("to")
  const always = from === "" && to === ""
  if (!always && !(TIME.test(from) && TIME.test(to) && from !== to)) return refuse()
  return e.next()
}

module.exports = { check }
