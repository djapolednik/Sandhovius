// Teksten en opmaak van de account-mails per taal. Gedeeld door de hooks in
// mail.pb.js en household.pb.js (hooks draaien in aparte VM's, daarom wordt
// dit per aanroep met require() geladen). Taal komt uit users.language; leeg
// of onbekend = Nederlands. De Nederlandse tekst staat ook in de
// collectiesjablonen (migratie 1790740000), als terugval.
//
// Opmaak in de stijl van de app ("The Lit Room at Night", DESIGN.md): een
// rustige mist-achtergrond, één wit paneel met ronde hoeken, "Sandhovius" als
// tekst (er is nog geen logo), een titel, korte tekst en één blauwe
// pilknop. Mailprogramma's kennen weinig CSS: tabellen en inline stijlen,
// geen externe lettertypen of plaatjes (er laadt niets van buiten als je de
// mail opent). Elke mail heeft ook een platte-tekstversie.

const TEXTS = {
  nl: {
    common: {
      fallback: "Werkt de knop niet? Open dan deze link:",
      sender: "Sandhovius, je huis lokaal bediend.",
    },
    verification: {
      subject: "Bevestig je e-mailadres voor Sandhovius",
      preheader: "Nog één stap, dan kun je je box koppelen.",
      title: "Bevestig je e-mailadres",
      intro: ["Welkom bij Sandhovius. Bevestig je e-mailadres; daarna kun je je box aan je account koppelen."],
      button: "E-mailadres bevestigen",
      validity: "De link werkt een dag.",
      ignore: "Heb je geen account aangemaakt? Dan kun je deze mail negeren.",
    },
    reset: {
      subject: "Wachtwoord opnieuw instellen voor Sandhovius",
      preheader: "Kies een nieuw wachtwoord; de link werkt een half uur.",
      title: "Kies een nieuw wachtwoord",
      intro: ["Je vroeg om een nieuw wachtwoord voor je Sandhovius-account. Met de knop hieronder kies je er een."],
      button: "Nieuw wachtwoord kiezen",
      validity: "De link werkt een half uur. Daarna vraag je in de app een nieuwe aan.",
      ignore: "Heb je dit niet aangevraagd? Dan kun je deze mail negeren; je wachtwoord blijft zoals het was.",
    },
    authAlert: {
      subject: "Nieuwe inlog bij Sandhovius",
      preheader: "Er is ingelogd vanaf een nieuw apparaat of een nieuwe plek.",
      title: "Nieuwe inlog op je account",
      intro: ["Er is ingelogd op je Sandhovius-account vanaf een nieuw apparaat of een nieuwe plek:"],
      warning: "Was jij dit niet? Kies dan meteen een nieuw wachtwoord; daarmee log je overal anders uit.",
      ignore: "Was jij het wel? Dan hoef je niets te doen.",
    },
    invitation: {
      subject: "{inviter} nodigt je uit voor {house}",
      preheader: "Bedien {house} samen met Sandhovius.",
      title: "Je bent uitgenodigd",
      intro: ["{inviter} nodigt je uit om {house} samen te bedienen met Sandhovius."],
      roles: { member: "Als huisgenoot", admin: "Als beheerder" },
      guest: "Als gast, tot en met {date}",
      months: ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"],
      expires: "Verloopt over 7 dagen",
      how: "Log in of maak een account aan met dit e-mailadres; de uitnodiging staat dan bovenaan je Home.",
      button: "Uitnodiging bekijken",
      ignore: "Ken je de afzender niet? Dan kun je deze mail negeren.",
    },
  },
  en: {
    common: {
      fallback: "Button not working? Open this link instead:",
      sender: "Sandhovius, your home controlled locally.",
    },
    verification: {
      subject: "Confirm your email for Sandhovius",
      preheader: "One more step, then you can link your box.",
      title: "Confirm your email address",
      intro: ["Welcome to Sandhovius. Confirm your email address; after that you can link your box to your account."],
      button: "Confirm email address",
      validity: "The link works for one day.",
      ignore: "Didn't create an account? You can ignore this email.",
    },
    reset: {
      subject: "Reset your password for Sandhovius",
      preheader: "Choose a new password; the link works for half an hour.",
      title: "Choose a new password",
      intro: ["You asked for a new password for your Sandhovius account. Use the button below to choose one."],
      button: "Choose a new password",
      validity: "The link works for half an hour. After that, ask for a new one in the app.",
      ignore: "Didn't ask for this? You can ignore this email; your password stays as it was.",
    },
    authAlert: {
      subject: "New sign-in to Sandhovius",
      preheader: "Someone signed in from a new device or location.",
      title: "New sign-in to your account",
      intro: ["Someone signed in to your Sandhovius account from a new device or location:"],
      warning: "If this wasn't you, choose a new password right away; that signs you out everywhere else.",
      ignore: "If this was you, you don't need to do anything.",
    },
    invitation: {
      subject: "{inviter} invited you to {house}",
      preheader: "Control {house} together with Sandhovius.",
      title: "You're invited",
      intro: ["{inviter} invited you to control {house} together with Sandhovius."],
      roles: { member: "As a housemate", admin: "As an admin" },
      guest: "As a guest, until {date}",
      months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
      expires: "Expires in 7 days",
      how: "Sign in or create an account with this email address; the invitation then appears at the top of your Home.",
      button: "View invitation",
      ignore: "Don't know the sender? You can ignore this email.",
    },
  },
}

// Kleuren en letter uit DESIGN.md (licht thema: mail kent geen donker thema
// dat overal werkt, dus zeggen we "licht" en houden we het contrast hoog).
const C = {
  page: "#f0f0f0",
  panel: "#ffffff",
  inset: "#f3f3f4",
  hairline: "#e4e4e7",
  ink: "#000000",
  quiet: "#5e626b",
  accent: "#0066ff",
  accentInk: "#ffffff",
  amber: "#b45309",
  amberBg: "#fef3c7",
}
const FONT = "Urbanist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

function textsFor(language) {
  return TEXTS[language] || TEXTS.nl
}

// Alles wat van gebruikers of van buiten komt (namen, huisnaam, toestelgegevens)
// en ook de link (in een attribuut) gaat geëscaped de HTML in.
function escapeHTML(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// Een alinea in de stijl van de app; quiet = secundaire tekst.
function para(html, quiet) {
  return (
    '<p style="margin:0 0 16px;font-family:' + FONT + ";font-size:16px;line-height:1.55;color:" +
    (quiet ? C.quiet : C.ink) + ';">' + html + "</p>"
  )
}

// Een pilknop die ook in Outlook een knop is (de tabelcel draagt de kleur).
function button(label, link) {
  return (
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">' +
    '<tr><td align="center" bgcolor="' + C.accent + '" style="border-radius:999px;">' +
    '<a href="' + escapeHTML(link) + '" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;' +
    "font-family:" + FONT + ";font-size:16px;font-weight:600;line-height:1.2;color:" + C.accentInk +
    ';text-decoration:none;border-radius:999px;">' + escapeHTML(label) + "</a></td></tr></table>"
  )
}

// Een blok op Inset (zoals een vlak binnen een paneel in de app).
function card(innerHTML) {
  return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;">' +
    '<tr><td style="background:' + C.inset + ";border-radius:18px;padding:16px 18px;font-family:" + FONT + ';">' +
    innerHTML + "</td></tr></table>"
  )
}

// De hele mail: mist-achtergrond, "Sandhovius", het witte paneel met de
// inhoud, en onder het paneel een rustige afzenderregel.
function layout(language, preheader, title, contentHTML) {
  const common = textsFor(language).common
  return (
    "<!doctype html>\n" +
    '<html lang="' + (language === "en" ? "en" : "nl") + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">' +
    "<title>" + escapeHTML(title) + "</title></head>" +
    '<body style="margin:0;padding:0;background:' + C.page + ';">' +
    // Voorvertoning in de inbox, niet zichtbaar in de mail zelf.
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:' + C.page + ';">' +
    escapeHTML(preheader) + "</div>" +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.page +
    '" style="background:' + C.page + ';"><tr><td align="center" style="padding:32px 16px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">' +
    '<tr><td style="padding:0 8px 16px;font-family:' + FONT + ";font-size:20px;font-weight:600;letter-spacing:-0.02em;color:" +
    C.ink + ';">Sandhovius</td></tr>' +
    '<tr><td bgcolor="' + C.panel + '" style="background:' + C.panel + ';border-radius:28px;padding:32px 28px 12px;">' +
    '<h1 style="margin:0 0 16px;font-family:' + FONT + ";font-size:26px;line-height:1.2;font-weight:600;letter-spacing:-0.02em;color:" +
    C.ink + ';">' + escapeHTML(title) + "</h1>" +
    contentHTML +
    "</td></tr>" +
    '<tr><td style="padding:16px 8px 0;font-family:' + FONT + ";font-size:14px;line-height:1.5;color:" + C.quiet + ';">' +
    escapeHTML(common.sender) + "</td></tr>" +
    "</table></td></tr></table></body></html>"
  )
}

// Knop, met de link nog eens als tekst eronder (sommige mailprogramma's
// blokkeren knoppen), plus de rustige regels (geldigheid, negeren).
function action(language, label, link, quietLines) {
  const common = textsFor(language).common
  let html = button(label, link)
  for (const line of quietLines) html += para(escapeHTML(line), true)
  // Klein: met een lang token is de link anders een blauw blok.
  html +=
    '<p style="margin:0 0 16px;font-family:' + FONT + ";font-size:13px;line-height:1.5;color:" + C.quiet + ';">' +
    escapeHTML(common.fallback) + '<br><a href="' + escapeHTML(link) + '" target="_blank" rel="noopener" style="color:' +
    C.quiet + ';word-break:break-all;">' + escapeHTML(link) + "</a></p>"
  return html
}

function plainText(title, lines) {
  return [title, "", ...lines.filter((l) => l !== null), "", "Sandhovius"].join("\n")
}

function render(kind, language, link) {
  const t = textsFor(language)[kind]
  const content = t.intro.map((p) => para(escapeHTML(p))).join("") + action(language, t.button, link, [t.validity, t.ignore])
  return {
    subject: t.subject,
    html: layout(language, t.preheader, t.title, content),
    text: plainText(t.title, [...t.intro, "", t.button + ": " + link, "", t.validity, t.ignore]),
  }
}

// De inlogmelding heeft geen knop maar wel de gegevens van het toestel
// (tijd, IP-adres, user-agent); die komen van buiten, dus escapen.
function renderAuthAlert(language, info) {
  const t = textsFor(language).authAlert
  const content =
    t.intro.map((p) => para(escapeHTML(p))).join("") +
    card('<p style="margin:0;font-size:15px;line-height:1.5;color:' + C.ink + ';word-break:break-word;">' +
      escapeHTML(info || "") + "</p>") +
    '<p style="margin:0 0 16px;padding:14px 16px;border-radius:18px;background:' + C.amberBg + ";font-family:" + FONT +
    ";font-size:16px;line-height:1.5;font-weight:600;color:" + C.amber + ';">' + escapeHTML(t.warning) + "</p>" +
    para(escapeHTML(t.ignore), true)
  return {
    subject: t.subject,
    html: layout(language, t.preheader, t.title, content),
    text: plainText(t.title, [...t.intro, String(info || ""), "", t.warning, t.ignore]),
  }
}

// Uitnodiging: naam van de uitnodiger en huisnaam komen van gebruikers, dus
// in de HTML escapen; in het onderwerp (een header) alleen regeleinden weg.
// Het huis staat als klein kaartje in de mail: naam, rol, verloopt.
// until: "JJJJ-MM-DD" bij een gast (D2), anders leeg.
function renderInvitation(language, inviter, houseName, link, role, until) {
  const t = textsFor(language).invitation
  // met een functie vervangen: anders betekent "$&" in een naam iets
  const fill = (s, esc) =>
    s.replace("{inviter}", () => esc(inviter || "")).replace("{house}", () => esc(houseName || ""))
  const plain = (v) => String(v).replace(/[\r\n]+/g, " ")
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(until || "")
  const date = parts ? Number(parts[3]) + " " + t.months[Number(parts[2]) - 1] + " " + parts[1] : ""
  const roleText = date ? t.guest.replace("{date}", date) : t.roles[role] || t.roles.member
  const content =
    t.intro.map((p) => para(fill(p, escapeHTML))).join("") +
    card(
      '<p style="margin:0 0 4px;font-size:20px;line-height:1.25;font-weight:600;color:' + C.ink + ';word-break:break-word;">' +
        escapeHTML(houseName || "") + "</p>" +
        '<p style="margin:0;font-size:15px;line-height:1.5;color:' + C.quiet + ';">' +
        escapeHTML(roleText) + ". " + escapeHTML(t.expires) + ".</p>"
    ) +
    para(escapeHTML(t.how)) +
    action(language, t.button, link, [t.ignore])
  return {
    subject: fill(t.subject, plain),
    html: layout(language, fill(t.preheader, plain), t.title, content),
    text: plainText(t.title, [
      ...t.intro.map((p) => fill(p, plain)),
      plain(houseName || "") + ": " + roleText + ". " + t.expires + ".",
      "",
      t.how,
      "",
      t.button + ": " + link,
      "",
      t.ignore,
    ]),
  }
}

module.exports = {
  verification: (language, link) => render("verification", language, link),
  reset: (language, link) => render("reset", language, link),
  authAlert: renderAuthAlert,
  invitation: renderInvitation,
}
