/// <reference path="../pb_data/types.d.ts" />
// Mail uit de omgeving, en account-mails in de taal van het account.
//
// SMTP, afzender en appURL komen uit env-variabelen (SMTP_HOST, SMTP_PORT,
// SMTP_USERNAME, SMTP_PASSWORD, SMTP_TLS, MAIL_FROM, APP_URL), zodat dev
// (Mailpit) en productie dezelfde code draaien. Zonder SMTP_HOST blijft de
// opgeslagen configuratie ongemoeid.

onBootstrap((e) => {
  e.next()
  const host = $os.getenv("SMTP_HOST")
  if (!host) return

  const settings = $app.settings()
  settings.smtp.enabled = true
  settings.smtp.host = host
  settings.smtp.port = parseInt($os.getenv("SMTP_PORT") || "587", 10)
  settings.smtp.username = $os.getenv("SMTP_USERNAME")
  settings.smtp.password = $os.getenv("SMTP_PASSWORD")
  settings.smtp.tls = $os.getenv("SMTP_TLS") === "true"
  settings.meta.senderName = "Sandhovius"
  settings.meta.senderAddress = $os.getenv("MAIL_FROM") || "noreply@sandhovius.local"
  const appURL = $os.getenv("APP_URL")
  if (appURL) settings.meta.appURL = appURL
  $app.save(settings)
})

// De sjablonen van de collectie zijn de Nederlandse terugval; deze hooks
// vervangen onderwerp en tekst per mail door de taal van het account.
onMailerRecordVerificationSend((e) => {
  const texts = require(`${__hooks}/mail_texts.js`)
  const link = $app.settings().meta.appURL + "/bevestig?token=" + e.meta.token
  const m = texts.verification(e.record.getString("language"), link)
  e.message.subject = m.subject
  e.message.html = m.html
  e.next()
}, "users")

onMailerRecordPasswordResetSend((e) => {
  const texts = require(`${__hooks}/mail_texts.js`)
  const link = $app.settings().meta.appURL + "/wachtwoord?token=" + e.meta.token
  const m = texts.reset(e.record.getString("language"), link)
  e.message.subject = m.subject
  e.message.html = m.html
  e.next()
}, "users")
