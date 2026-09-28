/// <reference path="../pb_data/types.d.ts" />
// Scènes: één tik zet meerdere apparaten goed ("Naar bed"). De scène
// hoort bij een huis en beschrijft zijn stappen als JSON in dezelfde
// woorden als een los commando: [{ device, action, payload }].
//
// Uitvoeren gebeurt op de box: de app maakt één command
// { scene, action: "run_scene" } en de agent voert alle stappen uit. Zo
// maakt het niet uit als de telefoon halverwege wegvalt, en kunnen
// schema's later dezelfde weg gebruiken.
migrate((app) => {
  const houses = app.findCollectionByNameOrId("houses")

  const scenes = new Collection({
    type: "base",
    name: "scenes",
    listRule: "house.user = @request.auth.id",
    viewRule: "house.user = @request.auth.id",
    createRule: "@request.body.house.user = @request.auth.id",
    updateRule: "house.user = @request.auth.id && @request.body.house:isset = false",
    deleteRule: "house.user = @request.auth.id",
    fields: [
      { type: "relation", name: "house", required: true, collectionId: houses.id, cascadeDelete: true, maxSelect: 1 },
      { type: "text", name: "name", required: true, max: 60 },
      { type: "number", name: "order", onlyInt: true },
      { type: "json", name: "actions", maxSize: 20000 },
    ],
  })
  app.save(scenes)

  // Een command is óf voor één apparaat, óf voor één scène — nooit een mix.
  // Anders zou iemand met een eigen scène een los commando naar andermans
  // apparaat kunnen laten gaan.
  const commands = app.findCollectionByNameOrId("commands")
  commands.fields.getByName("device").required = false
  commands.fields.add(new RelationField({
    name: "scene",
    required: false,
    collectionId: scenes.id,
    cascadeDelete: true,
    maxSelect: 1,
  }))
  commands.fields.getByName("action").values = ["turn_on", "turn_off", "toggle", "set_temperature", "provision", "run_scene"]
  const own = "(device.gateway.user = @request.auth.id || scene.house.user = @request.auth.id)"
  commands.listRule = own
  commands.viewRule = own
  commands.createRule =
    'status = "pending" && (' +
    '(action != "run_scene" && scene = "" && device.gateway.user = @request.auth.id) || ' +
    '(action = "run_scene" && device = "" && scene.house.user = @request.auth.id))'
  return app.save(commands)
}, (app) => {
  const commands = app.findCollectionByNameOrId("commands")
  commands.fields.removeByName("scene")
  commands.fields.getByName("device").required = true
  commands.fields.getByName("action").values = ["turn_on", "turn_off", "toggle", "set_temperature", "provision"]
  commands.listRule = "device.gateway.user = @request.auth.id"
  commands.viewRule = "device.gateway.user = @request.auth.id"
  commands.createRule = 'device.gateway.user = @request.auth.id && status = "pending"'
  app.save(commands)
  return app.delete(app.findCollectionByNameOrId("scenes"))
})
