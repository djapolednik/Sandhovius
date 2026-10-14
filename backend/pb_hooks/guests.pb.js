/// <reference path="../pb_data/types.d.ts" />
// Verlopen gasten weghalen (spec 2026-10-14-guests-design.md): elke minuut,
// wie voorbij zijn einddatum is gaat uit het huis, met dezelfde opruiming als
// vertrekken (membership.js).
cronAdd("expire_guests", "* * * * *", () => {
  const now = new Date().toISOString().replace("T", " ")
  const expired = $app.findRecordsByFilter("guests", "ends <= {:now}", "", 0, 0, { now: now })
  for (const g of expired) {
    try {
      $app.runInTransaction((txApp) => {
        const house = txApp.findRecordById("houses", g.getString("house"))
        require(`${__hooks}/membership.js`).removeMember(txApp, house, g.getString("user"))
        try {
          txApp.delete(txApp.findRecordById("guests", g.id))
        } catch (_) {}
      })
      $app.logger().info("gast verlopen", "house", g.getString("house"), "user", g.getString("user"))
    } catch (err) {
      $app.logger().error("gast weghalen mislukt", "guest", g.id, "error", String(err))
    }
  }
})
