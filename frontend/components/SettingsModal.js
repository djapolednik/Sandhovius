'use client'

import Modal from './Modal'
import { useTheme } from '../lib/useTheme'

export default function SettingsModal({ onClose }) {
  const { isDarkMode, toggleTheme } = useTheme()

  return (
    <Modal title="Instellingen" onClose={onClose}>
      <div className="settings-row">
        <span id="setting-dark-mode">Donkere modus</span>
        <button
          className={`switch switch-accent ${isDarkMode ? 'switch-on' : ''}`}
          role="switch"
          aria-checked={isDarkMode}
          aria-labelledby="setting-dark-mode"
          onClick={toggleTheme}
        >
          <span className="switch-thumb" />
        </button>
      </div>
    </Modal>
  )
}
