'use client'

export default function LightCard({ state, header }) {
  const raw = state?.state
  const isOn = raw === 'on'
  const isKnown = raw === 'on' || raw === 'off'

  return (
    <>
      {header}
      <div className={`status-line ${isOn ? 'status-on' : 'status-off'}`}>
        {isKnown ? (isOn ? 'Ingeschakeld' : 'Uitgeschakeld') : 'Status onbekend'}
      </div>
    </>
  )
}
