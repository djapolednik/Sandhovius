'use client'

import { useEffect, useState } from 'react'
import PocketBase, { LocalAuthStore } from 'pocketbase'
import Header from '../components/Header'
import DeviceCard from '../components/DeviceCard'
import UserMenu from '../components/UserMenu'
import SettingsModal from '../components/SettingsModal'
import HouseModal from '../components/HouseModal'
import AddDeviceModal from '../components/AddDeviceModal'
import ToastContainer from '../components/ToastContainer'
import SensorDetailModal from '../components/SensorDetailModal'
import { relativeTimeNL } from '../lib/relativeTime'

// Expliciete storageKey ("pocketbase_auth" i.p.v. de SDK-default "pb_auth")
// zodat de sessie herkenbaar is in devtools/Application/LocalStorage. De
// SDK's LocalAuthStore persisteert en herstelt token+record hieruit
// vanzelf — geen eigen opslag-code nodig.
const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL, new LocalAuthStore('pocketbase_auth'))
const SELECTED_ROOM_KEY = 'sandhovius-selected-room'

// Puur informatief loggen bij verbindingsverlies — de SDK herverbindt en
// herabonneert zelf automatisch (met backoff), hier is niets aan te doen.
pb.realtime.onDisconnect = (activeSubscriptions) => {
  console.warn('[realtime] Verbinding verbroken, actieve subscriptions:', activeSubscriptions)
}

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const [houses, setHouses] = useState([])
  const [rooms, setRooms] = useState([])
  const [devices, setDevices] = useState([])
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [animatingDeviceIds, setAnimatingDeviceIds] = useState([])
  const [lastRealtimeAt, setLastRealtimeAt] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [toasts, setToasts] = useState([])

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [houseModalOpen, setHouseModalOpen] = useState(false)
  const [addDeviceOpen, setAddDeviceOpen] = useState(false)
  const [sensorDetailDeviceId, setSensorDetailDeviceId] = useState(null)

  useEffect(() => {
    setLoggedIn(pb.authStore.isValid)
  }, [])

  useEffect(() => {
    if (loggedIn) {
      fetchAll()
    }
  }, [loggedIn])

  // Realtime: elke device_state-wijziging (van eender welk device, ook
  // eentje die niet via de PWA zelf is aangestuurd, bv. rechtstreeks in HA)
  // komt hier binnen en werkt de UI direct bij — geen polling, geen
  // page reload. device_state.listRule scoped dit al server-side tot de
  // devices van de ingelogde user.
  useEffect(() => {
    if (!loggedIn) return

    let unsubscribe
    let cancelled = false

    pb.collection('device_state')
      .subscribe('*', (e) => {
        setLastRealtimeAt(Date.now())
        if (e.action === 'delete') return
        setDevices((prev) =>
          prev.map((d) =>
            d.id === e.record.device
              ? { ...d, expand: { ...d.expand, device_state_via_device: [e.record] } }
              : d
          )
        )
      })
      .then((unsub) => {
        if (cancelled) {
          unsub()
          return
        }
        unsubscribe = unsub
        setLastRealtimeAt(Date.now())
      })
      .catch((err) => {
        console.error('[realtime] Abonneren op device_state mislukt:', err)
      })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [loggedIn])

  // Tikt elke 5s zodat de "laatste update"-tekst blijft meelopen, ook
  // zonder nieuwe realtime-events (anders zou "zojuist" nooit ouder worden).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])

  async function login(e) {
    e.preventDefault()
    setError('')
    setLoggingIn(true)
    try {
      await pb.collection('users').authWithPassword(email, password)
      setLoggedIn(true)
    } catch (err) {
      setError('Inloggen mislukt: ' + err.message)
    } finally {
      setLoggingIn(false)
    }
  }

  function logout() {
    pb.authStore.clear()
    setLoggedIn(false)
    setHouses([])
    setRooms([])
    setDevices([])
    setSelectedRoomId('')
    setLastRealtimeAt(null)
  }

  // houses/rooms/devices.listRule filteren al op de ingelogde user, dus we
  // vragen alles rechtstreeks op. Er is voorlopig maar één huis per user —
  // zodra dat verandert is er hier een echte huis-keuze nodig, nu is het
  // gewoon "het eerste (en enige) huis".
  async function fetchAll() {
    setError('')
    try {
      const [houseRecords, roomRecords, deviceRecords] = await Promise.all([
        pb.collection('houses').getFullList(),
        pb.collection('rooms').getFullList({ sort: 'order' }),
        pb.collection('devices').getFullList({ expand: 'device_state_via_device' }),
      ])
      setHouses(houseRecords)
      setRooms(roomRecords)
      setDevices(deviceRecords)

      const house = houseRecords[0]
      if (house) {
        console.log(`House: ${house.name}`)
      }
    } catch (err) {
      setError('Kon devices niet ophalen: ' + err.message)
    }
  }

  const house = houses[0]
  const roomsInHouse = rooms.filter((room) => room.house === house?.id)
  const devicesInHouse = devices.filter((device) => device.gateway === house?.id)
  const roomIds = roomsInHouse.map((room) => room.id)
  const unassignedDevices = devicesInHouse.filter((device) => !roomIds.includes(device.room))

  // Herstelt de laatst gekozen room-tab uit localStorage, of valt terug op
  // de eerste room — zowel bij het eerste bezoek als na een reload. Draait
  // opnieuw zodra rooms/devices binnenkomen, zodat een tab die niet meer
  // bestaat (kamer verwijderd elders) niet blijft "hangen".
  useEffect(() => {
    if (!house) return
    const validIds = unassignedDevices.length > 0 ? [...roomIds, '__unassigned'] : roomIds

    setSelectedRoomId((prev) => {
      if (prev && validIds.includes(prev)) return prev
      const stored = window.localStorage.getItem(SELECTED_ROOM_KEY)
      if (stored && validIds.includes(stored)) return stored
      return validIds[0] ?? ''
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [house?.id, rooms, devices])

  function selectRoom(roomId) {
    setSelectedRoomId(roomId)
    window.localStorage.setItem(SELECTED_ROOM_KEY, roomId)
  }

  // Toont een korte melding rechtsboven die zichzelf na 2s weer verwijdert
  // (de fade-out zelf is puur CSS, zie .toast — dit ruimt alleen de state
  // op zodat de DOM-node niet blijft hangen).
  function showToast(message, type = 'info') {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 2000)
  }

  const sensorDetailDevice = devices.find((d) => d.id === sensorDetailDeviceId) ?? null

  const devicesInSelectedRoom =
    selectedRoomId === '__unassigned'
      ? unassignedDevices
      : devicesInHouse.filter((device) => device.room === selectedRoomId)

  // Optimistisch: de knop flipt meteen, geen "bezig..."-status. Het
  // commando gaat op de achtergrond naar de agent; na een korte wachttijd
  // wordt de echte state opgehaald om eventueel bij te sturen als het toch
  // anders uitpakte (device offline, commando mislukt, etc).
  async function toggleDevice(device) {
    const stateRecord = device.expand?.device_state_via_device?.[0]
    const currentValue = stateRecord?.state?.state
    // Climate-entities rapporteren hun state als hvac_mode ("heat", "off",
    // ...), niet als het simpele "on"/"off" van lampen/stopcontacten.
    const isOn = device.type === 'climate' ? currentValue && currentValue !== 'off' : currentValue === 'on'
    const willBeOn = !isOn
    const nextValue = willBeOn ? (device.type === 'climate' ? 'heat' : 'on') : 'off'
    const optimisticState = { ...stateRecord, state: { ...stateRecord?.state, state: nextValue } }

    setDevices((prev) =>
      prev.map((d) =>
        d.id === device.id
          ? { ...d, expand: { ...d.expand, device_state_via_device: [optimisticState] } }
          : d
      )
    )
    setAnimatingDeviceIds((prev) => [...prev, device.id])
    setTimeout(() => {
      setAnimatingDeviceIds((prev) => prev.filter((id) => id !== device.id))
    }, 500)
    showToast(`${device.name} ${willBeOn ? 'aan' : 'uit'}`)

    setError('')
    try {
      const command = await pb.collection('commands').create({
        device: device.id,
        action: 'toggle',
        status: 'pending',
      })
      watchCommandForFailure(command.id)
      setTimeout(fetchAll, 1500)
    } catch (err) {
      showToast(`Fout: ${err.message}`, 'error')
      setError('Commando versturen mislukt: ' + err.message)
      fetchAll()
    }
  }

  // Luistert kort mee op één specifiek commando om te zien of de agent het
  // als mislukt markeert (bv. device offline) — succes is al gedekt door
  // de optimistic toast hierboven, dus alleen falen verdient hier een
  // melding. Stopt vanzelf zodra het commando een eindstatus heeft, met
  // een korte veiligheidsklep zodat een subscription nooit blijft hangen.
  function watchCommandForFailure(commandId) {
    let unsub
    let stopped = false
    const stop = () => {
      if (stopped) return
      stopped = true
      unsub?.()
    }

    pb.collection('commands')
      .subscribe(commandId, (e) => {
        if (e.record.status === 'failed') {
          showToast(`Fout: ${e.record.error || 'commando mislukt'}`, 'error')
        }
        if (e.record.status !== 'pending') stop()
      })
      .then((u) => {
        if (stopped) {
          u()
          return
        }
        unsub = u
      })
      .catch(() => {
        // Best-effort — als het abonneren zelf al mislukt (bv. even
        // offline) valt dit terug op de gewone fetchAll-reconciliatie.
      })

    setTimeout(stop, 10000)
  }

  async function saveDevice(deviceId, updates) {
    const updated = await pb.collection('devices').update(deviceId, updates)
    setDevices((prev) => prev.map((d) => (d.id === deviceId ? { ...d, ...updated } : d)))
  }

  async function deleteDevice(deviceId) {
    await pb.collection('devices').delete(deviceId)
    setDevices((prev) => prev.filter((d) => d.id !== deviceId))
  }

  async function createDevice(fields) {
    const created = await pb.collection('devices').create({ ...fields, gateway: house.id, online: false })
    setDevices((prev) => [...prev, created])
  }

  async function renameHouse(name) {
    const updated = await pb.collection('houses').update(house.id, { name })
    setHouses((prev) => prev.map((h) => (h.id === updated.id ? updated : h)))
  }

  async function addRoom(name) {
    const order = roomsInHouse.length
    const created = await pb.collection('rooms').create({ house: house.id, name, order })
    setRooms((prev) => [...prev, created])
  }

  async function renameRoom(roomId, name) {
    const updated = await pb.collection('rooms').update(roomId, { name })
    setRooms((prev) => prev.map((r) => (r.id === roomId ? updated : r)))
  }

  // Devices in de verwijderde kamer verliezen hun room-relatie (Pocket
  // Base's default gedrag bij een niet-cascade relatie) en vallen na de
  // eerstvolgende fetch onder "Overig" — niets wordt weggegooid.
  async function deleteRoom(roomId) {
    await pb.collection('rooms').delete(roomId)
    setRooms((prev) => prev.filter((r) => r.id !== roomId))
  }

  if (!loggedIn) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-title">Sandhovius</h1>
          <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <input
              className="input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="input"
              type="password"
              placeholder="Wachtwoord"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary" disabled={loggingIn}>
              {loggingIn ? (
                <>
                  <span className="spinner" />
                  Authenticating...
                </>
              ) : (
                'Inloggen'
              )}
            </button>
          </form>
          {error && <p className="login-error">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <>
      <ToastContainer toasts={toasts} />

      <Header
        userMenu={
          <UserMenu
            onChangeHouse={() => setHouseModalOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onLogout={logout}
          />
        }
      />

      <div className="container">
        {house && <p className="gateway-name">{house.name}</p>}
        <p className="realtime-status">Laatste update: {relativeTimeNL(lastRealtimeAt, now)}</p>

        {error && <p className="error-banner">{error}</p>}

        <div className="room-tabs">
          {roomsInHouse.map((room) => (
            <button
              key={room.id}
              className={`room-tab ${selectedRoomId === room.id ? 'room-tab-active' : ''}`}
              onClick={() => selectRoom(room.id)}
            >
              {room.name}
            </button>
          ))}
          {unassignedDevices.length > 0 && (
            <button
              className={`room-tab ${selectedRoomId === '__unassigned' ? 'room-tab-active' : ''}`}
              onClick={() => selectRoom('__unassigned')}
            >
              Overig
            </button>
          )}
        </div>

        <ul className="device-list">
          {devicesInSelectedRoom.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              rooms={roomsInHouse}
              onToggle={() => toggleDevice(device)}
              onOpenDetail={() => setSensorDetailDeviceId(device.id)}
              isAnimating={animatingDeviceIds.includes(device.id)}
              onSaveDevice={saveDevice}
              onDeleteDevice={deleteDevice}
            />
          ))}
        </ul>

        <button className="fab" aria-label="Device toevoegen" onClick={() => setAddDeviceOpen(true)}>
          +
        </button>

        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

        {houseModalOpen && (
          <HouseModal
            house={house}
            rooms={roomsInHouse}
            onRenameHouse={renameHouse}
            onAddRoom={addRoom}
            onRenameRoom={renameRoom}
            onDeleteRoom={deleteRoom}
            onClose={() => setHouseModalOpen(false)}
          />
        )}

        {addDeviceOpen && (
          <AddDeviceModal
            rooms={roomsInHouse}
            onCreate={createDevice}
            onClose={() => setAddDeviceOpen(false)}
          />
        )}

        {sensorDetailDevice && (
          <SensorDetailModal
            device={sensorDetailDevice}
            now={now}
            onClose={() => setSensorDetailDeviceId(null)}
          />
        )}
      </div>
    </>
  )
}
