'use client'

// De kop van elk tabblad: een titel, eventueel een regel eronder (de
// datum op Home), en rechts één actie (bv. "Apparaat toevoegen").
export default function Header({ title, subtitle, action }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-titles">
          {subtitle && <p className="topbar-subtitle">{subtitle}</p>}
          <h1 className="topbar-title">{title}</h1>
        </div>
        {action && <div className="topbar-action">{action}</div>}
      </div>
    </header>
  )
}
