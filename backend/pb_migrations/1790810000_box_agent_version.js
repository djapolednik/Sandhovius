/// <reference path="../pb_data/types.d.ts" />
// Welke agentversie draait op een box, en wanneer hij zich voor het laatst
// meldde (bij elke (her)verbinding, ook zonder huis). Alleen de hook in
// pb_hooks/box.pb.js schrijft deze velden; een box mag zijn eigen record
// niet bijwerken (anders kon hij zijn huis zetten). Bewoners zien boxen
// niet, dus dit is alleen voor beheer (PocketBase-dashboard).
migrate((app) => {
  const boxes = app.findCollectionByNameOrId("boxes")
  boxes.fields.add(new TextField({ name: "agent_version", max: 64 }))
  boxes.fields.add(new DateField({ name: "reported_at" }))
  app.save(boxes)
}, (app) => {
  const boxes = app.findCollectionByNameOrId("boxes")
  boxes.fields.removeByName("agent_version")
  boxes.fields.removeByName("reported_at")
  app.save(boxes)
})
