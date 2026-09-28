'use client'

import Modal from './Modal'
import MoveButtons from './MoveButtons'

// De volgorde van de favorieten op Home: de bovenste staat het eerst.
// Elke stap slaat zichzelf op, zoals alles in de sheets.
export default function FavoritesOrderModal({ favorites, onMove, onClose }) {
  return (
    <Modal title="Volgorde favorieten" onClose={onClose}>
      <p className="settings-hint" style={{ marginTop: 0 }}>
        De bovenste staat op Home het eerst.
      </p>
      <ul className="house-list order-list">
        {favorites.map((device, index) => (
          <li key={device.id} className="order-item">
            <span className="order-item-name">{device.name}</span>
            <MoveButtons label={device.name} index={index} count={favorites.length} onMove={(delta) => onMove(device.id, delta)} />
          </li>
        ))}
      </ul>
    </Modal>
  )
}
