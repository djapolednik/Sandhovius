/// <reference path="../pb_data/types.d.ts" />
// Wanneer een commando voor het laatst veranderde (pending → sent/failed).
// Samen met "created" (zie 1790600000_add_command_created.js) laat dit zien
// hoe lang de box over een commando deed; handig bij debuggen.
//
// Ruimt ook "sent_at" op: dat veld kwam uit een migratie die nooit in git
// stond, werd door niets gevuld of gelezen en zegt niets wat "updated" en
// "status" niet al zeggen. Beide stappen kijken eerst of het veld er is, zodat
// dit op een verse database en op een bestaande dev-database hetzelfde
// eindschema geeft.
migrate((app) => {
  const commands = app.findCollectionByNameOrId("commands")
  if (!commands.fields.getByName("updated")) {
    commands.fields.add(new AutodateField({ name: "updated", onCreate: true, onUpdate: true }))
  }
  if (commands.fields.getByName("sent_at")) {
    commands.fields.removeByName("sent_at")
  }
  return app.save(commands)
}, (app) => {
  const commands = app.findCollectionByNameOrId("commands")
  commands.fields.removeByName("updated")
  return app.save(commands)
})
