/// <reference path="../pb_data/types.d.ts" />
// Koppelsessies: wie de sessie startte (created_by), en per huis één open
// sessie tegelijk; twee telefoons die tegelijk zoeken zouden elkaars vondsten
// zien of weghalen (spec 2026-10-14-device-pairing-design.md).
onRecordCreateRequest((e) => {
  if (e.auth && e.auth.collection().name === "users") e.record.set("created_by", e.auth.id)

  const open = e.app.findRecordsByFilter(
    "pairing_sessions",
    "house = {:house} && (status = 'starting' || status = 'open' || status = 'waiting_button')",
    "", 1, 0, { house: e.record.getString("house") },
  )
  if (open.length > 0) {
    return e.json(400, { status: 400, code: "session_open", params: {}, message: "session_open", data: {} })
  }
  return e.next()
}, "pairing_sessions")
