'use client'

import Modal from './Modal'
import { useTheme } from '../lib/useTheme'

export default function SettingsModal({ onClose }) {
  const { isDarkMode, toggleTheme } = useTheme()

  return (
    <Modal title="Instellingen" onClose={onClose}>
      <div className="settings-row">
        <span>Donkere modus</span>
        <button
          className={`switch ${isDarkMode ? 'switch-on' : ''}`}
          role="switch"
          aria-checked={isDarkMode}
          onClick={toggleTheme}
        >
          <span className="switch-thumb" />
        </button>
      </div>
    </Modal>
  )
}
