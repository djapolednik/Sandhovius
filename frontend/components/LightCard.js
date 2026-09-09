'use client'

export default function LightCard({ device, state, onToggle, isPending }) {
  const raw = state?.state
  const isOn = raw === 'on'
  const isKnown = raw === 'on' || raw === 'off'

  return (
    <li className="card">
      <div className="device-card-header">
        <div>
          <div className="device-name">{device.name}</div>
          <div className="device-meta">{device.online ? 'Online' : 'Offline'}</div>
        </div>
        <button
          className={`btn ${isOn ? 'btn-on' : 'btn-off'}`}
          onClick={onToggle}
          disabled={isPending}
        >
          {isPending ? 'Bezig' : isOn ? 'Aan' : 'Uit'}
        </button>
      </div>
      <div className={`status-line ${isOn ? 'status-on' : 'status-off'}`}>
        {isKnown ? (isOn ? 'Ingeschakeld' : 'Uitgeschakeld') : 'Status onbekend'}
      </div>
    </li>
  )
}
