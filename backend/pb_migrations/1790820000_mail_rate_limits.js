/// <reference path="../pb_data/types.d.ts" />
// Rate limits op alles wat een account aanmaakt of mail verstuurt, anders kan
// een script via ons SMTP-account onbeperkt mail sturen. Per IP (PocketBase
// kent geen limiet per e-mailadres), dus ruim genoeg voor een gezin achter
// één router. Achter een proxy (cloud) moeten de trusted-proxy-instellingen
// kloppen, anders delen alle klanten één IP en dus één limiet.
const RULES = [
  { label: "users:create", audience: "", duration: 3600, maxRequests: 10 },
  { label: "users:requestVerification", audience: "", duration: 600, maxRequests: 5 },
  { label: "users:requestPasswordReset", audience: "", duration: 600, maxRequests: 5 },
]

migrate((app) => {
  const settings = app.settings()
  for (const r of RULES) settings.rateLimits.rules.push(r)
  app.save(settings)
}, (app) => {
  const settings = app.settings()
  settings.rateLimits.rules = settings.rateLimits.rules.filter((r) => !RULES.some((x) => x.label === r.label))
  app.save(settings)
})
