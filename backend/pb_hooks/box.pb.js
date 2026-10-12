/// <reference path="../pb_data/types.d.ts" />
// Een box meldt zich: agentversie en tijdstip op zijn eigen record. De box
// mag zijn record niet zelf bijwerken (dan kon hij zijn huis zetten); deze
// route schrijft alleen deze twee velden, en alleen voor de ingelogde box.

routerAdd("POST", "/api/sandhovius/box/report", (e) => {
  const fail = (status, message) => e.json(status, { status: status, message: message, data: {} })
  const body = e.requestInfo().body || {}
  const version = typeof body.agent_version === "string" ? body.agent_version.trim() : ""
  // Wat `git describe` maakt (v1.2.3-4-gabc1234-dirty) of "dev"; niets anders.
  if (!/^[0-9A-Za-z._+-]{1,64}$/.test(version)) return fail(400, "Ongeldige versie")

  const box = $app.findRecordById("boxes", e.auth.id)
  box.set("agent_version", version)
  box.set("reported_at", new DateTime())
  $app.save(box)
  return e.noContent(204)
}, $apis.requireAuth("boxes"))
