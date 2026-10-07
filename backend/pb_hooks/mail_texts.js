// Teksten van de account-mails per taal. Gedeeld door de hooks in mail.pb.js
// (hooks draaien in aparte VM's, daarom wordt dit per aanroep met require()
// geladen). Taal komt uit users.language; leeg of onbekend = Nederlands. De
// Nederlandse tekst staat ook in de collectiesjablonen (migratie 1790740000),
// als terugval.
const TEXTS = {
  nl: {
    verification: {
      subject: "Bevestig je e-mailadres voor Sandhovius",
      intro: "Welkom bij Sandhovius. Bevestig je e-mailadres om je box te kunnen koppelen.",
      button: "E-mailadres bevestigen",
      ignore: "Heb je geen account aangemaakt? Dan kun je deze mail negeren.",
    },
    reset: {
      subject: "Wachtwoord opnieuw instellen voor Sandhovius",
      intro: "Je vroeg om een nieuw wachtwoord voor Sandhovius.",
      button: "Nieuw wachtwoord kiezen",
      ignore: "Heb je dit niet aangevraagd? Dan kun je deze mail negeren; je wachtwoord blijft zoals het was.",
    },
    authAlert: {
      subject: "Nieuwe inlog bij Sandhovius",
      intro: "Er is ingelogd op je Sandhovius-account vanaf een nieuw apparaat of een nieuwe plek:",
      warning: "Was jij dit niet? Kies dan meteen een nieuw wachtwoord; daarmee log je overal anders uit.",
      ignore: "Was jij het wel? Dan hoef je niets te doen.",
    },
    invitation: {
      subject: "{inviter} nodigt je uit voor {house}",
      intro: "{inviter} nodigt je uit om {house} samen te bedienen met Sandhovius.",
      how: "Log in of maak een account aan met dit e-mailadres; de uitnodiging staat dan bovenaan je Home. Hij verloopt na 7 dagen.",
      button: "Uitnodiging bekijken",
      ignore: "Ken je de afzender niet? Dan kun je deze mail negeren.",
    },
  },
  en: {
    verification: {
      subject: "Confirm your email for Sandhovius",
      intro: "Welcome to Sandhovius. Confirm your email address so you can link your box.",
      button: "Confirm email address",
      ignore: "Didn't create an account? You can ignore this email.",
    },
    reset: {
      subject: "Reset your password for Sandhovius",
      intro: "You asked for a new password for Sandhovius.",
      button: "Choose a new password",
      ignore: "Didn't ask for this? You can ignore this email; your password stays as it was.",
    },
    authAlert: {
      subject: "New sign-in to Sandhovius",
      intro: "Someone signed in to your Sandhovius account from a new device or location:",
      warning: "If this wasn't you, choose a new password right away; that signs you out everywhere else.",
      ignore: "If this was you, you don't need to do anything.",
    },
    invitation: {
      subject: "{inviter} invited you to {house}",
      intro: "{inviter} invited you to control {house} together with Sandhovius.",
      how: "Sign in or create an account with this email address; the invitation then appears at the top of your Home. It expires after 7 days.",
      button: "View invitation",
      ignore: "Don't know the sender? You can ignore this email.",
    },
  },
}

function render(kind, language, link) {
  const t = (TEXTS[language] || TEXTS.nl)[kind]
  const html =
    "<p>" + t.intro + "</p>\n" +
    '<p><a href="' + link + '" target="_blank" rel="noopener">' + t.button + "</a></p>\n" +
    "<p><i>" + t.ignore + "</i></p>"
  return { subject: t.subject, html: html }
}

// De inlogmelding heeft geen link maar wel de gegevens van het toestel
// (tijd, IP-adres, user-agent); die komen van buiten, dus escapen.
function escapeHTML(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function renderAuthAlert(language, info) {
  const t = (TEXTS[language] || TEXTS.nl).authAlert
  const html =
    "<p>" + t.intro + "</p>\n" +
    "<p><em>" + escapeHTML(info || "") + "</em></p>\n" +
    "<p><strong>" + t.warning + "</strong></p>\n" +
    "<p>" + t.ignore + "</p>"
  return { subject: t.subject, html: html }
}

// Uitnodiging: naam van de uitnodiger en huisnaam komen van gebruikers, dus
// in de HTML escapen; in het onderwerp (een header) alleen regeleinden weg.
function renderInvitation(language, inviter, houseName, link) {
  const t = (TEXTS[language] || TEXTS.nl).invitation
  // met een functie vervangen: anders betekent "$&" in een naam iets
  const fill = (s, esc) =>
    s.replace("{inviter}", () => esc(inviter || "")).replace("{house}", () => esc(houseName || ""))
  const plain = (v) => String(v).replace(/[\r\n]+/g, " ")
  const html =
    "<p>" + fill(t.intro, escapeHTML) + "</p>\n" +
    "<p>" + t.how + "</p>\n" +
    '<p><a href="' + link + '" target="_blank" rel="noopener">' + t.button + "</a></p>\n" +
    "<p><i>" + t.ignore + "</i></p>"
  return { subject: fill(t.subject, plain), html: html }
}

module.exports = {
  verification: (language, link) => render("verification", language, link),
  reset: (language, link) => render("reset", language, link),
  authAlert: renderAuthAlert,
  invitation: renderInvitation,
}
