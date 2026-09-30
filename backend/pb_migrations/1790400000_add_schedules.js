/// <reference path="../pb_data/types.d.ts" />
// Schema's: een scène vanzelf laten uitvoeren op een tijdstip en weekdagen
// ("Naar bed" om 23:00 op werkdagen). De agent op de box klokt en voert de
// scène uit; de app bewerkt alleen deze records.
//
// time is "HH:MM" in lokale tijd (Europe/Amsterdam). last_run/last_error
// schrijft alleen de agent; de regels houden de gebruiker daar weg.
migrate((app) => {
  const houses = app.findCollectionByNameOrId("houses")
  const scenes = app.findCollectionByNameOrId("scenes")

  const agentOnly = "@request.body.last_run:isset = false && @request.body.last_error:isset = false"

  const schedules = new Collection({
    type: "base",
    name: "schedules",
    listRule: "house.user = @request.auth.id",
    viewRule: "house.user = @request.auth.id",
    createRule:
      "@request.body.house.user = @request.auth.id && @request.body.scene.house = @request.body.house && " + agentOnly,
    updateRule:
      "house.user = @request.auth.id && @request.body.house:isset = false && " +
      "(@request.body.scene:isset = false || @request.body.scene.house = house) && " + agentOnly,
    deleteRule: "house.user = @request.auth.id",
    fields: [
      { type: "relation", name: "house", required: true, collectionId: houses.id, cascadeDelete: true, maxSelect: 1 },
      { type: "relation", name: "scene", required: true, collectionId: scenes.id, cascadeDelete: true, maxSelect: 1 },
      { type: "text", name: "time", required: true, pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" },
      {
        type: "select",
        name: "days",
        required: true,
        maxSelect: 7,
        values: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      },
      { type: "bool", name: "enabled" },
      { type: "date", name: "last_run" },
      { type: "text", name: "last_error", max: 2000 },
    ],
  })
  return app.save(schedules)
}, (app) => {
  return app.delete(app.findCollectionByNameOrId("schedules"))
})
