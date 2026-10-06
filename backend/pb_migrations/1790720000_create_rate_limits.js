/// <reference path="../pb_data/types.d.ts" />
// Ruimere rate limit voor bulkacties. Sinds rate limits aan staan (migratie
// 1790700000) geldt de standaardregel *:create: 20 per 5 s per IP. Dat is te
// krap: "Alles uit" maakt één command per device tegelijk (plus "Ongedaan
// maken" binnen 5 s), en een box met veel devices maakt bij de eerste start
// voor elk device een device_state aan. Alleen voor ingelogde accounts
// (bewoner of box); de standaardregels blijven voor de rest zoals ze zijn.
const RULES = [
  { label: "commands:create", audience: "@auth", duration: 5, maxRequests: 100 },
  { label: "device_state:create", audience: "@auth", duration: 5, maxRequests: 100 },
]

migrate((app) => {
  const settings = app.settings()
  for (const r of RULES) settings.rateLimits.rules.push(r)
  app.save(settings)
}, (app) => {
  const labels = RULES.map((r) => r.label)
  const settings = app.settings()
  settings.rateLimits.rules = settings.rateLimits.rules.filter((r) => !labels.includes(r.label))
  app.save(settings)
})
