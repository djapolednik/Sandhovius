/// <reference path="../pb_data/types.d.ts" />
// Een box koppelen aan een huis (claim) en weer loskoppelen (release).
//
// Op de sticker staat een code van 12 tekens; de box bewaart alleen de sha256
// van de genormaliseerde code in boxes.claim_code_hash (hidden). De regels:
// - Onbekend serienummer en foute code geven exact hetzelfde antwoord (400),
//   zodat je serienummers niet kunt aftasten.
// - Alles dat records wijzigt gebeurt in één transactie, en de box wordt in
//   die transactie opnieuw gelezen: bij twee gelijktijdige claims wint er één.
// - Een box zonder hash is nooit te claimen.
// - Alleen bewoners (users) mogen dit; de hash komt in geen enkel antwoord.
// Een handler in PocketBase ziet geen variabelen buiten zichzelf, dus de
// helpers staan binnen de handlers.

// Foutantwoorden hebben dezelfde vorm als die van PocketBase zelf:
// {status, message, data}, zodat de PWA overal `message` kan tonen.

routerAdd("POST", "/api/sandhovius/claim", (e) => {
  const fail = (status, message) => e.json(status, { status: status, message: message, data: {} })
  const str = (v) => (typeof v === "string" ? v : "")
  // Afspraak: hoofdletters, spaties en "-" weg, O -> 0, I en L -> 1.
  const normalize = (s) => s.toUpperCase().replace(/[ -]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1")

  const user = $app.findRecordById("users", e.auth.id)
  if (!user.verified()) return fail(403, "Bevestig eerst je e-mailadres")

  const body = e.requestInfo().body || {}
  // Serienummers staan in hoofdletters; "sh-dev-0001" overtikken moet ook werken.
  const serial = str(body.serial).trim().toUpperCase()
  const code = normalize(str(body.code))
  const replaceHouse = str(body.replace_house).trim()
  const houseName = str(body.house_name).trim().slice(0, 100) || "Thuis"

  // Uitkomst van de transactie; fouten worden na afloop teruggegeven zodat de
  // transactie netjes eindigt (en niets wijzigt bij een fout).
  let result = null

  $app.runInTransaction((txApp) => {
    let box = null
    try {
      box = txApp.findFirstRecordByData("boxes", "serial", serial)
    } catch (_) {}

    // Altijd één vergelijking doen, ook zonder box of zonder hash, zodat de
    // looptijd niets verraadt. Een lege hash of lege code telt nooit mee.
    const stored = box ? box.getString("claim_code_hash") : ""
    const given = code ? $security.sha256(code) : ""
    const same = $security.equal(stored || "x", given || "y")
    if (!box || !stored || !code || !same) {
      result = { status: 400, message: "Deze code klopt niet" }
      return
    }

    // Een bestaand huis om te vervangen moet van deze gebruiker zijn.
    let house = null
    if (replaceHouse) {
      try {
        house = txApp.findRecordById("houses", replaceHouse)
      } catch (_) {}
      if (!house || house.getString("user") !== user.id) {
        result = { status: 404, message: "Huis niet gevonden" }
        return
      }
    }

    const current = box.getString("house")
    if (current) {
      // Al gekoppeld aan een huis van deze gebruiker (bv. nog een keer
      // tikken na een gelukte claim): dat huis teruggeven en niets wijzigen.
      // Lekt niets, want de juiste code en het eigenaarschap zijn nodig.
      let linked = null
      try {
        linked = txApp.findRecordById("houses", current)
      } catch (_) {}
      if (linked && linked.getString("user") === user.id) {
        result = { status: 200, house: linked.id }
        return
      }
      result = { status: 409, message: "Deze box is al gekoppeld" }
      return
    }

    if (house) {
      // Andere boxen van dit huis worden losgekoppeld: één box per huis.
      const others = txApp.findAllRecords("boxes", $dbx.hashExp({ house: house.id }))
      for (const o of others) {
        o.set("house", "")
        txApp.save(o)
      }
    } else {
      house = new Record(txApp.findCollectionByNameOrId("houses"))
      house.set("user", user.id)
      house.set("name", houseName)
    }
    house.set("claimed_at", new DateTime())
    txApp.save(house)

    box.set("house", house.id)
    txApp.save(box)
    result = { status: 200, house: house.id }
  })

  if (result.status !== 200) return fail(result.status, result.message)
  return e.json(200, { house: result.house })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/sandhovius/release", (e) => {
  const fail = (status, message) => e.json(status, { status: status, message: message, data: {} })
  const body = e.requestInfo().body || {}
  const houseId = typeof body.house === "string" ? body.house.trim() : ""

  let result = null
  $app.runInTransaction((txApp) => {
    let house = null
    try {
      house = txApp.findRecordById("houses", houseId)
    } catch (_) {}
    if (!house || house.getString("user") !== e.auth.id) {
      result = { status: 404, message: "Huis niet gevonden" }
      return
    }
    const boxes = txApp.findAllRecords("boxes", $dbx.hashExp({ house: house.id }))
    for (const b of boxes) {
      b.set("house", "")
      txApp.save(b)
    }
    house.set("claimed_at", "")
    txApp.save(house)
    result = { status: 200, house: house.id }
  })

  if (result.status !== 200) return fail(result.status, result.message)
  return e.json(200, { house: result.house })
}, $apis.requireAuth("users"))
