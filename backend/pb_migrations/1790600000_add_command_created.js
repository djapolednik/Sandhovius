/// <reference path="../pb_data/types.d.ts" />
// Wanneer een commando is aangemaakt. De agent haalt na een uitval de
// openstaande commando's in, maar een tik van een uur geleden mag geen lamp
// meer aanzetten: commando's ouder dan twee minuten markeert hij als
// verlopen. Records van vóór deze migratie hebben geen waarde en gelden als
// verlopen. Handig bij debuggen is het ook.
migrate((app) => {
  const commands = app.findCollectionByNameOrId("commands")
  commands.fields.add(new AutodateField({ name: "created", onCreate: true, onUpdate: false }))
  return app.save(commands)
}, (app) => {
  const commands = app.findCollectionByNameOrId("commands")
  commands.fields.removeByName("created")
  return app.save(commands)
})
