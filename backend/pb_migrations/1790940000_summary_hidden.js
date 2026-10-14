/// <reference path="../pb_data/types.d.ts" />
// "Telt mee in de samenvatting" per apparaat (roadmap E2). Opgeslagen als
// devices.summary_hidden (standaard uit = telt mee), zodat bestaande apparaten
// zonder datamigratie blijven meetellen. Alleen de bewoner zet het; de box
// niet (zoals shown_as en adaptive).
const BEFORE = "@request.body.adaptive:isset = false"
const AFTER = BEFORE + " && @request.body.summary_hidden:isset = false"

migrate(
  (app) => {
    const devices = app.findCollectionByNameOrId("devices")
    for (const r of ["createRule", "updateRule"]) {
      const rule = String(devices[r])
      if (rule.split(BEFORE).length !== 2) throw new Error("devices." + r + " wijkt af: " + rule)
      devices[r] = rule.replace(BEFORE, AFTER)
    }
    devices.fields.add(new BoolField({ name: "summary_hidden" }))
    app.save(devices)
  },
  (app) => {
    const devices = app.findCollectionByNameOrId("devices")
    for (const r of ["createRule", "updateRule"]) devices[r] = String(devices[r]).replace(AFTER, BEFORE)
    devices.fields.removeByName("summary_hidden")
    app.save(devices)
  },
)
