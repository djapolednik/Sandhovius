/// <reference path="../pb_data/types.d.ts" />
// Klimaatstanden (F2): 0 (standaard) of 5–30° in halve graden. Een
// verkeerde waarde geeft invalid_climate_presets met de stand.
// De superuser (beheer, tests) slaat de controle over, zoals bij de andere hooks.
onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  for (const name of ["climate_comfort", "climate_eco", "climate_sleep"]) {
    const v = e.record.getFloat(name)
    const ok = v === 0 || (v >= 5 && v <= 30 && Math.round(v * 2) === v * 2)
    if (!ok) {
      return e.json(400, {
        status: 400, code: "invalid_climate_presets", params: { preset: name.replace("climate_", "") },
        message: "invalid " + name, data: {},
      })
    }
  }
  return e.next()
}, "houses")
