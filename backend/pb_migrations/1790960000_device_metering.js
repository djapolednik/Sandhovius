/// <reference path="../pb_data/types.d.ts" />
// Energie (roadmap C2): device_state.metering voor een stekker met
// vermogensmeting, { power (W), energy_today (kWh), day }. Een eigen veld,
// want de stand (aan/uit) komt van Home Assistant en de meting van
// Zigbee2MQTT: zo overschrijven ze elkaar niet. Alleen de box schrijft het;
// de bestaande regels van device_state laten dat al toe.
migrate((app) => {
  const states = app.findCollectionByNameOrId("device_state")
  states.fields.add(new Field({ type: "json", name: "metering", maxSize: 1000 }))
  return app.save(states)
}, (app) => {
  const states = app.findCollectionByNameOrId("device_state")
  states.fields.removeByName("metering")
  return app.save(states)
})
