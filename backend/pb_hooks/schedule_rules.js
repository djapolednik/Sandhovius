// Controle op schedules, gedeeld door schedules.pb.js (PocketBase draait elke
// hook in een eigen context; gedeelde code gaat via require). time en trigger
// moeten bij elkaar passen (spec 2026-10-14-sun-schedules-design.md): een
// tijd-schema (trigger "time", of leeg zoals vóór de zon) heeft een geldige
// HH:MM en geen verschuiving; een zon-schema heeft geen tijd. De regels kunnen
// dat niet uitdrukken. De superuser (beheer, tests) slaat de controle over.
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

function check(e) {
  if (e.hasSuperuserAuth()) return e.next()
  const trigger = e.record.getString("trigger") || "time"
  const time = e.record.getString("time")
  const ok = trigger === "time" ? TIME.test(time) && e.record.getInt("offset_min") === 0 : time === ""
  if (!ok) {
    return e.json(400, { status: 400, code: "invalid_schedule_time", params: {}, message: "invalid_schedule_time", data: {} })
  }
  return e.next()
}

module.exports = { check }
