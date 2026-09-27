'use client'

// Altijd een donkere merk-balk (zie --header-bg in theme.css), los van het
// licht/donker thema van de rest van de app. userMenu is de avatar-
// dropdown; wordt alleen getoond wanneer ingelogd. De merknaam is geen
// kop: de kop van de pagina is de naam van je huis.
//
// Licht/donker staat alleen in Instellingen (één plek, geen dubbele
// knop), en volgt standaard het thema van de telefoon.
export default function Header({ userMenu }) {
  return (
    <div className="header-bar">
      <header className="header">
        <span className="brand">Sandhovius</span>
        <div className="header-user-slot">{userMenu}</div>
      </header>
    </div>
  )
}
