/// <reference path="../pb_data/types.d.ts" />
// Kleur volgt de dag (spec 2026-10-14-adaptive-light-design.md):
// devices.adaptive, door de bewoner per lamp aan te zetten. De box mag het
// niet zetten (net als shown_as); device_rules.js staat het alleen toe bij een
// lamp met kleurtemperatuur.
const SHOWN_AS = "@request.body.shown_as:isset = false"
const WITH_ADAPTIVE = SHOWN_AS + " && @request.body.adaptive:isset = false"

migrate(
  (app) => {
    const devices = app.findCollectionByNameOrId("devices")
    for (const r of ["createRule", "updateRule"]) {
      const rule = String(devices[r])
      if (rule.split(SHOWN_AS).length !== 2) throw new Error("devices." + r + " wijkt af: " + rule)
      devices[r] = rule.replace(SHOWN_AS, WITH_ADAPTIVE)
    }
    devices.fields.add(new BoolField({ name: "adaptive" }))
    app.save(devices)
  },
  (app) => {
    const devices = app.findCollectionByNameOrId("devices")
    for (const r of ["createRule", "updateRule"]) devices[r] = String(devices[r]).replace(WITH_ADAPTIVE, SHOWN_AS)
    devices.fields.removeByName("adaptive")
    app.save(devices)
  },
)
