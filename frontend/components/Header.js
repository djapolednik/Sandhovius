'use client'

// De kop van elk tabblad: een titel, eventueel een regel erboven (de datum
// op Home) en eronder (lede: hoe het huis erbij staat), en rechts één actie
// (bv. "Apparaat toevoegen", of "Alles uit" op Home).
export default function Header({ title, subtitle, lede, action }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-titles">
          {subtitle && <p className="topbar-subtitle">{subtitle}</p>}
          <h1 className="topbar-title">{title}</h1>
          {lede && (
            <p className="topbar-lede" role="status">
              {lede}
            </p>
          )}
        </div>
        {action && <div className="topbar-action">{action}</div>}
      </div>
    </header>
  )
}
