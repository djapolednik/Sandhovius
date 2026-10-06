// Eén kaart in de stijl van de login, voor de losse pagina's die je vanuit
// een e-mail opent (/bevestig, /wachtwoord).
export default function AccountShell({ title, children }) {
  return (
    <main className="login-page">
      <div className="login-solo login-card">
        <h1 className="login-title login-title-small">Sandhovius</h1>
        <p className="login-lede">{title}</p>
        {children}
      </div>
    </main>
  )
}
