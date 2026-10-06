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

module.exports = {
  verification: (language, link) => render("verification", language, link),
  reset: (language, link) => render("reset", language, link),
}
