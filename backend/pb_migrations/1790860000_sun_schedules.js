/// <reference path="../pb_data/types.d.ts" />
// Zon in schema's (spec 2026-10-14-sun-schedules-design.md): een schema loopt
// op een vaste tijd (trigger "time", zoals altijd) of bij zonsopkomst /
// zonsondergang met een verschuiving in minuten (negatief = ervoor). De box
// schrijft wanneer het de volgende keer loopt (next_run), zodat de app "vandaag
// om 18:42" kan zeggen.
//
// time is niet langer verplicht (leeg bij zon); schedules.pb.js bewaakt dat
// time en trigger bij elkaar passen. next_run is net als last_run alleen voor
// de box; trigger en offset_min alleen voor bewoners.
const RESIDENT_AGENT_ONLY = "@request.body.last_error:isset = false"
const BOX_FORBID = "@request.body.enabled:isset = false"

migrate(
  (app) => {
    const schedules = app.findCollectionByNameOrId("schedules")

    for (const r of ["createRule", "updateRule"]) {
      const rule = String(schedules[r])
      if (!rule.includes(RESIDENT_AGENT_ONLY)) throw new Error("schedules." + r + " wijkt af: " + rule)
      schedules[r] = rule.replace(RESIDENT_AGENT_ONLY, RESIDENT_AGENT_ONLY + " && @request.body.next_run:isset = false")
    }
    const update = String(schedules.updateRule)
    if (!update.includes(BOX_FORBID)) throw new Error("schedules.updateRule (box) wijkt af: " + update)
    schedules.updateRule = update.replace(
      BOX_FORBID,
      BOX_FORBID + " && @request.body.trigger:isset = false && @request.body.offset_min:isset = false",
    )

    schedules.fields.getByName("time").required = false
    schedules.fields.add(new SelectField({ name: "trigger", values: ["time", "sunrise", "sunset"], maxSelect: 1 }))
    schedules.fields.add(new NumberField({ name: "offset_min", onlyInt: true, min: -120, max: 120 }))
    schedules.fields.add(new DateField({ name: "next_run" }))
    app.save(schedules)

    for (const r of app.findAllRecords("schedules")) {
      r.set("trigger", "time")
      app.save(r)
    }
  },
  (app) => {
    const schedules = app.findCollectionByNameOrId("schedules")
    for (const r of app.findAllRecords("schedules")) {
      if (r.getString("trigger") !== "" && r.getString("trigger") !== "time") app.delete(r)
    }
    schedules.createRule = String(schedules.createRule).replace(" && @request.body.next_run:isset = false", "")
    schedules.updateRule = String(schedules.updateRule)
      .replace(" && @request.body.next_run:isset = false", "")
      .replace(" && @request.body.trigger:isset = false && @request.body.offset_min:isset = false", "")
    for (const name of ["trigger", "offset_min", "next_run"]) schedules.fields.removeByName(name)
    schedules.fields.getByName("time").required = true
    app.save(schedules)
  },
)
