'use client'

import LightCard from './LightCard'
import SensorCard from './SensorCard'
import ClimateCard from './ClimateCard'

export default function DeviceCard({ device, onToggle, isPending }) {
  const state = device.expand?.device_state_via_device?.[0]?.state ?? null

  switch (device.type) {
    case 'light':
    case 'switch':
      return <LightCard device={device} state={state} onToggle={onToggle} isPending={isPending} />
    case 'climate':
      return (
        <ClimateCard device={device} state={state} onToggle={onToggle} isPending={isPending} />
      )
    case 'sensor':
    default:
      return <SensorCard device={device} state={state} />
  }
}
