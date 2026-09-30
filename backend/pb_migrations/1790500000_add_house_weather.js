/// <reference path="../pb_data/types.d.ts" />
// Het weer bij het huis: de agent haalt het elk half uur uit Home Assistant
// (Met.no) en zet het hier, met het moment van ophalen. Zo komt het via de
// realtime van houses vanzelf in de PWA. Alleen de agent (superuser) schrijft
// deze velden; de regel houdt de gebruiker er weg.
//
// weather: { condition, temperature, hours: [{ time, condition, temperature,
// precipitation }], days: [{ date, condition, high, low, precipitation }] }
migrate((app) => {
  const houses = app.findCollectionByNameOrId("houses")
  houses.fields.add(new JSONField({ name: "weather", maxSize: 20000 }))
  houses.fields.add(new DateField({ name: "weather_updated" }))
  houses.updateRule =
    "user = @request.auth.id && @request.body.weather:isset = false && @request.body.weather_updated:isset = false"
  return app.save(houses)
}, (app) => {
  const houses = app.findCollectionByNameOrId("houses")
  houses.fields.removeByName("weather")
  houses.fields.removeByName("weather_updated")
  houses.updateRule = "user = @request.auth.id"
  return app.save(houses)
})
