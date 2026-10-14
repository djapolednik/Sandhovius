// Iemand uit een huis halen, op één plek: vertrekken, verwijderd worden en een
// verlopen gast (spec 2026-10-14-guests-design.md). Binnen een transactie
// aanroepen; de aanroeper controleert eerst of het mag (laatste beheerder).
// Gedeeld door household.pb.js en guests.pb.js.
function removeMember(txApp, house, target) {
  house.set("members", Array.from(house.getStringSlice("members")).filter((m) => m !== target))
  house.set("admins", Array.from(house.getStringSlice("admins")).filter((a) => a !== target))
  house.set("operate_only", Array.from(house.getStringSlice("operate_only")).filter((u) => u !== target))
  txApp.save(house)

  const params = { user: target, house: house.id }
  for (const f of txApp.findRecordsByFilter("favorites", "user = {:user} && device.gateway = {:house}", "", 0, 0, params)) {
    txApp.delete(f)
  }
  // Thuis/weg en een einddatum van iemand die geen lid meer is tellen niet meer.
  for (const name of ["presence", "guests"]) {
    for (const r of txApp.findRecordsByFilter(name, "user = {:user} && house = {:house}", "", 0, 0, params)) {
      txApp.delete(r)
    }
  }
}

module.exports = { removeMember }
