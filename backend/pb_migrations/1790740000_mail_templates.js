/// <reference path="../pb_data/types.d.ts" />
// Account-mails voor de claim-flow. Een bewoner maakt een account en moet het
// e-mailadres bevestigen voordat een box te koppelen is; "wachtwoord vergeten"
// hoort in dezelfde stijl. De standaardsjablonen van PocketBase zijn Engels en
// linken naar het admin-paneel (/_/#/auth/...), dat een bewoner nooit moet zien.
// Daarom: Nederlandse sjablonen met links naar de PWA ({APP_URL}/bevestig en
// /wachtwoord), plus een veld users.language (nl | en, leeg = nl). De hooks in
// pb_hooks/mail.pb.js kiezen per mail de taal; deze sjablonen zijn de
// Nederlandse terugval als een hook niet draait.
const VERIFY = {
  subject: "Bevestig je e-mailadres voor Sandhovius",
  body:
    "<p>Welkom bij Sandhovius. Bevestig je e-mailadres om je box te kunnen koppelen.</p>\n" +
    '<p><a href="{APP_URL}/bevestig?token={TOKEN}" target="_blank" rel="noopener">E-mailadres bevestigen</a></p>\n' +
    "<p><i>Heb je geen account aangemaakt? Dan kun je deze mail negeren.</i></p>",
}
const RESET = {
  subject: "Wachtwoord opnieuw instellen voor Sandhovius",
  body:
    "<p>Je vroeg om een nieuw wachtwoord voor Sandhovius.</p>\n" +
    '<p><a href="{APP_URL}/wachtwoord?token={TOKEN}" target="_blank" rel="noopener">Nieuw wachtwoord kiezen</a></p>\n' +
    "<p><i>Heb je dit niet aangevraagd? Dan kun je deze mail negeren; je wachtwoord blijft zoals het was.</i></p>",
}
// De stand van PocketBase zelf (snapshot), voor "down".
const OLD_VERIFY = {
  subject: "Verify your {APP_NAME} email",
  body:
    "<p>Hello,</p>\n<p>Thank you for joining us at {APP_NAME}.</p>\n<p>Click on the button below to verify your email address.</p>\n<p>\n  <a class=\"btn\" href=\"{APP_URL}/_/#/auth/confirm-verification/{TOKEN}\" target=\"_blank\" rel=\"noopener\">Verify</a>\n</p>\n<p><i>If you didn't recently register, please ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>",
}
const OLD_RESET = {
  subject: "Reset your {APP_NAME} password",
  body:
    "<p>Hello,</p>\n<p>Click on the button below to reset your password.</p>\n<p>\n  <a class=\"btn\" href=\"{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}\" target=\"_blank\" rel=\"noopener\">Reset password</a>\n</p>\n<p><i>If you didn't ask to reset your password, please ignore this email.</i></p>\n<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>",
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new SelectField({ name: "language", values: ["nl", "en"], maxSelect: 1 }))
  users.verificationTemplate.subject = VERIFY.subject
  users.verificationTemplate.body = VERIFY.body
  users.resetPasswordTemplate.subject = RESET.subject
  users.resetPasswordTemplate.body = RESET.body
  return app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("language")
  users.verificationTemplate.subject = OLD_VERIFY.subject
  users.verificationTemplate.body = OLD_VERIFY.body
  users.resetPasswordTemplate.subject = OLD_RESET.subject
  users.resetPasswordTemplate.body = OLD_RESET.body
  return app.save(users)
})
