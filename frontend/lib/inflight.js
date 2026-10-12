// Commando's die nog onderweg zijn, per apparaat. Zolang er één loopt toont
// de tegel het voornemen (_pending): een device_state-echo van een ouder
// commando (je sleept, er gaat om de 400 ms een commando uit) zou de tegel
// anders even terugzetten. Die echo bewaren we in _echo en tonen hem pas als
// het laatste commando klaar is.

export function createInflight() {
  const counts = new Map()
  return {
    count(id) {
      return counts.get(id) ?? 0
    },
    // Voor het versturen; done() bij klaar, mislukt of opgegeven. done is
    // eenmalig en geeft het aantal dat nog loopt.
    begin(id) {
      counts.set(id, (counts.get(id) ?? 0) + 1)
      let finished = false
      return () => {
        if (!finished) {
          finished = true
          const left = (counts.get(id) ?? 1) - 1
          if (left > 0) counts.set(id, left)
          else counts.delete(id)
        }
        return counts.get(id) ?? 0
      }
    },
  }
}

// De tijd van een stand (HA's last_updated, door de agent meegeschreven);
// NaN als hij ontbreekt (oudere agent, Zigbee-pad).
const stateTime = (record) => Date.parse(record?.state?.last_updated ?? '')

// Een device_state-echo voor dit apparaat; `running` = commando's onderweg.
// Ouder dan wat we al hebben (op het scherm of bewaard): weggooien. Een
// optimistische stand houdt de tijd van de echte stand waar hij van komt.
export function applyStateEcho(device, record, running) {
  const incoming = stateTime(record)
  const known = Math.max(
    ...[device.expand?.device_state_via_device?.[0], device._echo].map(stateTime).filter((t) => !Number.isNaN(t))
  )
  if (incoming < known) return device
  if (running > 0) return { ...device, _echo: record }
  const { _echo, ...rest } = device
  return { ...rest, _pending: false, expand: { ...device.expand, device_state_via_device: [record] } }
}

// Een commando is klaar. Loopt er geen meer, dan de bewaarde echo tonen (als
// die er is) en niet langer "wacht op de box".
export function settleDevice(device, running) {
  if (running > 0) return device
  const { _echo, ...rest } = device
  if (!_echo) return { ...rest, _pending: false }
  return { ...rest, _pending: false, expand: { ...device.expand, device_state_via_device: [_echo] } }
}
