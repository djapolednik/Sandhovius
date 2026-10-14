/// <reference path="../pb_data/types.d.ts" />
// Huishouden: uitnodigen, accepteren, rol wijzigen, verwijderen en verlaten.
//
// Lidmaatschap staat op het huis: members (iedereen) en admins (beheerders,
// altijd ook lid). Invariant: admins is een deel van members en nooit leeg.
// Niemand zet die velden met een gewone PATCH (regel in 1790760000); alleen
// deze hooks wijzigen ze, elk in één transactie, zodat de invariant op één
// plek bewaakt wordt.
//
// - Wie geen lid of beheerder is, krijgt 404: of een huis of lid bestaat,
//   blijft voor buitenstaanders onzichtbaar.
// - E-mailadressen worden in kleine letters vergeleken en opgeslagen.
// - Foutantwoorden {status, code, params, message, data}, zoals in
//   claim.pb.js: de app vertaalt de code, message is Engelse diagnose.
// Een handler in PocketBase ziet geen variabelen buiten zichzelf, dus de
// helpers staan binnen de handlers.

// Nieuwe uitnodiging: alleen als een beheerder van het huis hem maakt, vult de
// hook de rest in. Anders gaat het verzoek ongewijzigd door en weigert de
// createRule het, met hetzelfde antwoord of het adres nu lid is of niet.
onRecordCreateRequest((e) => {
  const email = e.record.getString("email").trim().toLowerCase()
  e.record.set("email", email)

  let house = null
  try {
    house = e.app.findRecordById("houses", e.record.getString("house"))
  } catch (_) {}
  const isUser = e.auth && e.auth.collection().name === "users"
  if (!house || !isUser || !house.getStringSlice("admins").includes(e.auth.id)) return e.next()

  const members = e.app.findRecordsByIds("users", Array.from(house.getStringSlice("members")))
  // Geen BadRequestError: die kan geen code meegeven. Zonder e.next() wordt
  // er niets aangemaakt.
  if (members.some((u) => u.email().toLowerCase() === email)) {
    return e.json(400, { status: 400, code: "already_member", params: {}, message: "already a member", data: {} })
  }

  const week = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  e.record.set("expires", week.toISOString().replace("T", " "))
  e.record.set("house_name", house.getString("name"))
  e.record.set("inviter_name", e.auth.getString("name") || e.auth.email())

  // Een oude uitnodiging voor dit adres in dit huis wordt vervangen (nieuwe
  // rol, nieuwe verloopdatum, nieuwe mail): weghalen en aanmaken samen.
  $app.runInTransaction((txApp) => {
    let old = null
    try {
      old = txApp.findFirstRecordByFilter("invitations", "house = {:house} && email = {:email}", {
        house: house.id,
        email: email,
      })
    } catch (_) {}
    if (old) txApp.delete(old)
    e.app = txApp
    e.next()
  })
}, "invitations")

// Na het aanmaken: de mail, in de taal van de uitnodiger. Lukt versturen niet,
// dan blijft de uitnodiging staan (de genodigde ziet hem na inloggen ook
// zonder mail); de fout gaat naar het log.
onRecordAfterCreateSuccess((e) => {
  e.next()
  const texts = require(`${__hooks}/mail_texts.js`)
  const inv = e.record
  let language = ""
  try {
    language = $app.findRecordById("users", inv.getString("invited_by")).getString("language")
  } catch (_) {}
  const settings = $app.settings()
  const m = texts.invitation(
    language,
    inv.getString("inviter_name"),
    inv.getString("house_name"),
    settings.meta.appURL + "/uitnodiging",
    inv.getString("role")
  )
  try {
    $app.newMailClient().send(new MailerMessage({
      from: { address: settings.meta.senderAddress, name: settings.meta.senderName },
      to: [{ address: inv.getString("email") }],
      subject: m.subject,
      html: m.html,
      text: m.text,
    }))
  } catch (err) {
    $app.logger().error("uitnodigingsmail niet verstuurd", "invitation", inv.id, "error", String(err))
  }
}, "invitations")

// Leden van een huis, voor ieder lid. users blijft dicht voor anderen, dus
// naam en e-mail komen via dit endpoint. Beheerders eerst, dan op naam.
routerAdd("GET", "/api/sandhovius/houses/{id}/members", (e) => {
  let house = null
  try {
    house = $app.findRecordById("houses", e.request.pathValue("id"))
  } catch (_) {}
  if (!house || !house.getStringSlice("members").includes(e.auth.id)) {
    return e.json(404, { status: 404, code: "house_not_found", params: {}, message: "house not found", data: {} })
  }
  const admins = Array.from(house.getStringSlice("admins"))
  const operateOnly = Array.from(house.getStringSlice("operate_only"))
  const items = $app.findRecordsByIds("users", Array.from(house.getStringSlice("members"))).map((u) => ({
    id: u.id,
    name: u.getString("name"),
    email: u.email(),
    role: admins.includes(u.id) ? "admin" : "member",
    // D1: mag automatiseringen en apparaten wijzigen (beheerders altijd).
    can_edit: admins.includes(u.id) || !operateOnly.includes(u.id),
  }))
  const label = (m) => (m.name || m.email).toLowerCase()
  items.sort((a, b) =>
    a.role !== b.role ? (a.role === "admin" ? -1 : 1) : label(a) < label(b) ? -1 : label(a) > label(b) ? 1 : 0
  )
  return e.json(200, { items: items })
}, $apis.requireAuth("users"))

// Uitnodiging accepteren. De uitnodiging hoort bij het e-mailadres: met een
// ander account is hij er niet (404). Al lid: uitnodiging weg, verder niets.
routerAdd("POST", "/api/sandhovius/invitations/{id}/accept", (e) => {
  const user = $app.findRecordById("users", e.auth.id)
  const id = e.request.pathValue("id")
  let result = null

  $app.runInTransaction((txApp) => {
    let inv = null
    try {
      inv = txApp.findRecordById("invitations", id)
    } catch (_) {}
    if (!inv || inv.getString("email") !== user.email().toLowerCase()) {
      result = { status: 404, code: "invitation_not_found", message: "invitation not found" }
      return
    }
    if (!user.verified()) {
      result = { status: 403, code: "email_not_verified", message: "email not verified" }
      return
    }
    const expires = new Date(inv.getString("expires").replace(" ", "T"))
    if (!(expires.getTime() > Date.now())) {
      result = { status: 410, code: "invitation_expired", message: "invitation expired" }
      return
    }

    const house = txApp.findRecordById("houses", inv.getString("house"))
    const members = Array.from(house.getStringSlice("members"))
    if (!members.includes(user.id)) {
      house.set("members", members.concat([user.id]))
      if (inv.getString("role") === "admin") {
        house.set("admins", Array.from(house.getStringSlice("admins")).concat([user.id]))
      }
      txApp.save(house)
    }
    txApp.delete(inv)
    result = { status: 200, house: house.id }
  })

  if (result.status !== 200) return e.json(result.status, { status: result.status, code: result.code, params: result.params || {}, message: result.message, data: {} })
  return e.json(200, { house: result.house })
}, $apis.requireAuth("users"))

// Rol van een lid wijzigen; alleen een beheerder van dit huis.
routerAdd("PATCH", "/api/sandhovius/houses/{id}/members/{user}", (e) => {
  const body = e.requestInfo().body || {}
  // role ("admin"/"member") en/of can_edit (D1: mag wijzigen); minstens één.
  const role = body.role
  const canEdit = body.can_edit
  const houseId = e.request.pathValue("id")
  const target = e.request.pathValue("user")
  let result = null

  $app.runInTransaction((txApp) => {
    let house = null
    try {
      house = txApp.findRecordById("houses", houseId)
    } catch (_) {}
    const admins = house ? Array.from(house.getStringSlice("admins")) : []
    if (!house || !admins.includes(e.auth.id)) {
      result = { status: 404, code: "house_not_found", message: "house not found" }
      return
    }
    const hasRole = role !== undefined && role !== null
    const hasCanEdit = canEdit !== undefined && canEdit !== null
    if ((!hasRole && !hasCanEdit) || (hasRole && role !== "admin" && role !== "member") || (hasCanEdit && typeof canEdit !== "boolean")) {
      result = { status: 400, code: "invalid_role", message: "role must be admin or member, can_edit a boolean" }
      return
    }
    if (!house.getStringSlice("members").includes(target)) {
      result = { status: 404, code: "member_not_found", message: "member not found" }
      return
    }
    const others = admins.filter((a) => a !== target)
    if (role === "member" && others.length === 0) {
      result = { status: 409, code: "last_admin", message: "a house needs at least one admin" }
      return
    }
    const nextAdmins = !hasRole ? admins : role === "admin" ? others.concat([target]) : others
    const isAdmin = nextAdmins.includes(target)
    // Een beheerder mag altijd alles: die kun je niet op alleen bedienen zetten.
    if (isAdmin && canEdit === false) {
      result = { status: 409, code: "admin_can_edit", message: "an admin can always edit" }
      return
    }
    const operateOnly = Array.from(house.getStringSlice("operate_only")).filter((u) => u !== target)
    const restrict = !isAdmin && (hasCanEdit ? canEdit === false : house.getStringSlice("operate_only").includes(target))
    house.set("admins", nextAdmins)
    house.set("operate_only", restrict ? operateOnly.concat([target]) : operateOnly)
    txApp.save(house)
    result = { status: 200, role: isAdmin ? "admin" : "member", canEdit: !restrict }
  })

  if (result.status !== 200) return e.json(result.status, { status: result.status, code: result.code, params: result.params || {}, message: result.message, data: {} })
  return e.json(200, { id: target, role: result.role, can_edit: result.canEdit })
}, $apis.requireAuth("users"))

// Lid verwijderen (beheerder) of het huis verlaten (jezelf). Je eigen
// favorieten voor apparaten van dit huis gaan mee; die in andere huizen
// blijven.
routerAdd("DELETE", "/api/sandhovius/houses/{id}/members/{user}", (e) => {
  const houseId = e.request.pathValue("id")
  const target = e.request.pathValue("user")
  let result = null

  $app.runInTransaction((txApp) => {
    let house = null
    try {
      house = txApp.findRecordById("houses", houseId)
    } catch (_) {}
    const members = house ? Array.from(house.getStringSlice("members")) : []
    const admins = house ? Array.from(house.getStringSlice("admins")) : []
    const self = target === e.auth.id && members.includes(e.auth.id)
    if (!house || !(admins.includes(e.auth.id) || self)) {
      result = { status: 404, code: "house_not_found", message: "house not found" }
      return
    }
    if (!members.includes(target)) {
      result = { status: 404, code: "member_not_found", message: "member not found" }
      return
    }
    if (admins.includes(target) && admins.length === 1) {
      result = { status: 409, code: "last_admin", message: "a house needs at least one admin" }
      return
    }
    house.set("members", members.filter((m) => m !== target))
    house.set("admins", admins.filter((a) => a !== target))
    house.set("operate_only", Array.from(house.getStringSlice("operate_only")).filter((u) => u !== target))
    txApp.save(house)

    const favorites = txApp.findRecordsByFilter("favorites", "user = {:user} && device.gateway = {:house}", "", 0, 0, {
      user: target,
      house: house.id,
    })
    for (const f of favorites) txApp.delete(f)
    // Thuis/weg van iemand die geen lid meer is telt niet meer mee.
    const presence = txApp.findRecordsByFilter("presence", "user = {:user} && house = {:house}", "", 0, 0, {
      user: target,
      house: house.id,
    })
    for (const p of presence) txApp.delete(p)
    result = { status: 204 }
  })

  if (result.status !== 204) return e.json(result.status, { status: result.status, code: result.code, params: result.params || {}, message: result.message, data: {} })
  return e.noContent(204)
}, $apis.requireAuth("users"))

// Account verwijderen: niet als je de laatste beheerder van een huis bent.
// Anders blijft er een huis zonder beheerder over (niemand kan nog uitnodigen
// of de box ontkoppelen), of, als je ook de enige bewoner was, een box die aan
// een huis vastzit dat niemand meer ziet. Een superuser mag het wel (herstel).
onRecordDeleteRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()
  const id = e.record.id
  const houses = e.app.findRecordsByFilter("houses", "admins.id ?= {:id}", "", 0, 0, { id: id })
  const sole = houses.find((h) => h.getStringSlice("admins").length === 1)
  if (sole) {
    return e.json(409, {
      status: 409,
      code: "last_admin_of_house",
      params: { house: sole.getString("name") },
      message: "user is the only admin of a house",
      data: {},
    })
  }
  return e.next()
}, "users")
