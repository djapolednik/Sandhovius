'use client'

import { useEffect, useId, useRef } from 'react'
import { useTranslations } from 'use-intl'
import { CloseIcon } from '../lib/icons'

// Native <dialog> via showModal(): de browser regelt zelf de focus-trap,
// maakt de rest van de pagina inert en geeft het venster de juiste
// dialog-rol — geen eigen focus-management-code nodig. React blijft de
// eigenaar van open/dicht: Escape (het 'cancel'-event) en een klik op de
// backdrop roepen onClose aan, de ouder unmount ons dan.
export default function Modal({ title, onClose, children }) {
  const t = useTranslations('common')
  const dialogRef = useRef(null)
  const openerRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    // Het element dat de modal opende (knop, menu-item) krijgt de focus
    // terug bij sluiten — een unmount zonder close() doet dat niet vanzelf.
    // Maar één keer vastleggen: StrictMode draait dit effect in dev twee
    // keer, en de tweede keer staat de focus al ín de dialog.
    if (!openerRef.current) openerRef.current = document.activeElement
    if (!dialog.open) dialog.showModal()
    // Zonder autofocus-veld zou de browser de sluitknop focussen, met een
    // focusring bovenin die net het eerste is wat je ziet. De sheet zelf
    // krijgt de focus: een schermlezer leest dan de titel voor, en Tab
    // gaat daarna gewoon naar de sluitknop.
    if (document.activeElement?.closest('.modal-header')) dialog.focus()
    return () => {
      // Eerst sluiten: zolang de dialog modaal open staat is de rest van de
      // pagina inert en kan de opener geen focus krijgen.
      if (dialog.open) dialog.close()
      const opener = openerRef.current
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  function handleCancel(e) {
    e.preventDefault()
    onClose()
  }

  // Een klik die rechtstreeks op het <dialog>-element landt (en niet op
  // .modal binnenin) valt buiten het venster: dat is de backdrop.
  function handleClick(e) {
    if (e.target === dialogRef.current) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      tabIndex={-1}
      aria-labelledby={titleId}
      onCancel={handleCancel}
      onClick={handleClick}
    >
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title" id={titleId}>
            {title}
          </h2>
          <button className="btn btn-icon btn-plain" aria-label={t('close')} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </dialog>
  )
}
