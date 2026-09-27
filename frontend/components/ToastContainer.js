'use client'

import { CloseIcon } from '../lib/icons'

// toasts: [{ id, message, type, duration }]. Elke toast verwijdert zichzelf
// via een timeout die de aanroeper instelt (zie showToast in page.js) —
// dit component rendert alleen, het beheert geen levensduur.
//
// Twee live regions die er altijd staan, ook leeg: een live region moet al
// in de DOM zitten vóórdat er tekst in verschijnt, anders kondigt een
// schermlezer de eerste toast niet aan. Fouten zitten in een eigen
// "alert"-regio (meteen voorlezen), meldingen in een "status"-regio
// (beleefd, na wat er nu voorgelezen wordt). Niet genest: een alert binnen
// een status-regio wordt door sommige schermlezers twee keer voorgelezen.
export default function ToastContainer({ toasts, onDismiss }) {
  const errors = toasts.filter((toast) => toast.type === 'error')
  const notices = toasts.filter((toast) => toast.type !== 'error')

  return (
    <div className="toast-container">
      <div className="toast-region" role="alert">
        {errors.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </div>
      <div className="toast-region" role="status">
        {notices.map((toast) => (
          <Toast key={toast.id} toast={toast} />
        ))}
      </div>
    </div>
  )
}

function Toast({ toast, onDismiss }) {
  return (
    <div className={`toast toast-${toast.type}`} style={{ '--toast-duration': `${toast.duration}ms` }}>
      <span className="toast-message">{toast.message}</span>
      {onDismiss && (
        <button type="button" className="toast-dismiss" aria-label="Melding sluiten" onClick={() => onDismiss(toast.id)}>
          <CloseIcon />
        </button>
      )}
    </div>
  )
}
