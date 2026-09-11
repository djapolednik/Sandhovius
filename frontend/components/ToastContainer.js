'use client'

// toasts: [{ id, message, type }]. Elke toast verwijdert zichzelf via een
// timeout die de aanroeper instelt (zie showToast in page.js) — dit
// component rendert alleen, het beheert geen levensduur.
export default function ToastContainer({ toasts }) {
  if (toasts.length === 0) return null

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      ))}
    </div>
  )
}
