'use client'

import Modal from './Modal'
import { deviceTypeIcon } from '../lib/icons'
import { relativeTimeNL } from '../lib/relativeTime'
import { useNow } from '../lib/useNow'
import { formatTemperature, temperatureColor, readTemperature } from '../lib/temperature'
import { isBatteryLow } from '../lib/battery'

export default function SensorDetailModal({ device, onClose }) {
  // Eigen klok: alleen deze modal tikt mee voor "Laatst bijgewerkt".
  const now = useNow(5000)
  const stateRecord = device.expand?.device_state_via_device?.[0] ?? null
  const state = stateRecord?.state ?? null
  const Icon = deviceTypeIcon(device.type)

  const occupancy = state?.occupancy ?? state?.motion
  const hasMotionReading = typeof occupancy === 'boolean'

  const temperature = readTemperature(state)
  const hasTemperatureReading = typeof temperature === 'number'

  const battery = state?.battery
  const hasBattery = typeof battery === 'number'

  const updatedAt = stateRecord?.updated_at ? new Date(stateRecord.updated_at).getTime() : null

  return (
    <Modal title="Sensorgegevens" onClose={onClose}>
      <div className="sensor-detail-header">
        <div className={`device-icon device-icon-${device.type}`}>
          <Icon />
        </div>
        <div>
          <div className="device-name">{device.name}</div>
          <div className="device-meta">{device.online ? 'Online' : 'Offline'}</div>
        </div>
      </div>

      <div className="modal-divider" />

      <div className="sensor-detail-rows">
        {hasTemperatureReading && (
          <div className="sensor-detail-row">
            <span className="form-label">Temperatuur</span>
            <span className="reading-value" style={{ color: temperatureColor(temperature) }}>
              {formatTemperature(temperature)}
            </span>
          </div>
        )}
        {hasMotionReading && (
          <div className="sensor-detail-row">
            <span className="form-label">Beweging</span>
            <span className="reading-value">{occupancy ? 'Nu beweging' : 'Geen beweging'}</span>
          </div>
        )}
        {hasBattery && (
          <div className="sensor-detail-row">
            <span className="form-label">Batterij</span>
            <span className={`reading-value ${isBatteryLow(battery) ? 'reading-alert' : ''}`}>
              {isBatteryLow(battery) ? `Bijna leeg (${battery}%)` : `${battery}%`}
            </span>
          </div>
        )}
        {updatedAt && (
          <div className="sensor-detail-row">
            <span className="form-label">Laatst bijgewerkt</span>
            <span className="reading-value">{relativeTimeNL(updatedAt, now)}</span>
          </div>
        )}
        {!hasTemperatureReading && !hasMotionReading && !hasBattery && (
          <p className="reading-empty">Nog geen meetwaarden ontvangen</p>
        )}
      </div>
    </Modal>
  )
}
