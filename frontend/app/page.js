'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import PocketBase, { LocalAuthStore } from 'pocketbase'
import Header from '../components/Header'
import DeviceCard, { TOGGLEABLE_TYPES, isDeviceOn } from '../components/DeviceCard'
import DeviceSettingsModal from '../components/DeviceSettingsModal'
import HousePanel from '../components/HousePanel'
import HouseModal from '../components/HouseModal'
import AddDeviceModal from '../components/AddDeviceModal'
import ToastContainer from '../components/ToastContainer'
import BottomNav, { TABS } from '../components/BottomNav'
import RoomTabs from '../components/RoomTabs'
import SettingsView from '../components/SettingsView'
import { describeError, isSessionExpired } from '../lib/errors'
import { houseConnection } from '../lib/connection'
import { useNow } from '../lib/useNow'
import { PlusIcon, ScenesIcon, deviceTypeIcon } from '../lib/icons'

const DATE_FORMAT = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })

// "Zondag 27 september"
function formatToday(ms) {
  const text = DATE_FORMAT.format(ms)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Het tabblad staat in de URL (#kamers), zodat de terugknop van de
// telefoon tussen tabbladen terugspringt en een herlaadbeurt je laat waar
// je was.
function tabFromHash() {
  const id = window.location.hash.replace('#', '')
  return TABS.some((tab) => tab.id === id) ? id : 'home'
}

// Expliciete storageKey ("pocketbase_auth" i.p.v. de SDK-default "pb_auth")
// zodat de sessie herkenbaar is in devtools/Application/LocalStorage. De
// SDK's LocalAuthStore persisteert en herstelt token+record hieruit
// vanzelf — geen eigen opslag-code nodig.
const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL, new LocalAuthStore('pocketbase_auth'))
const SELECTED_ROOM_KEY = 'sandhovius-selected-room'
// Zo lang mag het klaarzetten van een nieuw apparaat duren voordat de kaart
// het niet meer "Wordt klaargezet" noemt (normaal: een paar seconden).
const NEW_DEVICE_GRACE_MS = 2 * 60 * 1000
// Een commando dat na zo lang nog niet is afgehandeld krijgt een "even
// geduld"-melding; na de tweede grens geven we het op en tonen we weer de
// echte stand.
const COMMAND_SLOW_MS = 4000
const COMMAND_GIVE_UP_MS = 15000

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
  // Deze telefoon ↔ Sandhovius: 'connecting' tot de eerste realtime-
  // verbinding staat, 'lost' zodra die wegvalt (de SDK herverbindt zelf).
  const [realtimeLink, setRealtimeLink] = useState('connecting')
  // Tikt mee voor de hartslag-controle van de box (zie lib/connection.js).
  const now = useNow(15000)
  const [toasts, setToasts] = useState([])
  // false tot de eerste fetchAll klaar is — zonder dit flitst de
  // "geen apparaten"-lege staat heel even op vóórdat de data binnen is.
  const [loaded, setLoaded] = useState(false)
  // Aparte vlag naast `error`: alleen een mislukte fetchAll verdient een
  // "opnieuw proberen"-knop — een mislukt commando los je niet op door
  // opnieuw alles op te halen.
  const [fetchFailed, setFetchFailed] = useState(false)

  const [tab, setTab] = useState('home')
  const [houseModalOpen, setHouseModalOpen] = useState(false)
  const [addDeviceOpen, setAddDeviceOpen] = useState(false)
  const [settingsDeviceId, setSettingsDeviceId] = useState(null)
  const [shelfIds, setShelfIds] = useState([])
  // Apparaten die je in deze sessie net toevoegde: hun kaart zegt "Wordt
  // klaargezet" i.p.v. "Offline" tot de box ze gekoppeld heeft.
  const [newDeviceIds, setNewDeviceIds] = useState([])

  useEffect(() => {
    setLoggedIn(pb.authStore.isValid)
  }, [])

  useEffect(() => {
    if (loggedIn) {
      fetchAll()
    }
  }, [loggedIn])

  // Realtime: elke wijziging (van eender welk device, ook eentje die niet
  // via de PWA zelf is aangestuurd, bv. rechtstreeks in HA) komt hier
  // binnen en werkt de UI direct bij — geen polling, geen page reload. De
  // listRules scopen dit al server-side tot het huis van de ingelogde user.
  // - device_state: aan/uit, meetwaarden
  // - devices: online/offline, naam, kamer, net gekoppeld
  // - houses: de hartslag van de box (last_seen) en zijn status
  useEffect(() => {
    if (!loggedIn) return

    let cancelled = false
    const unsubscribers = []
    // Na een verbroken verbinding kunnen we events gemist hebben: dan
    // alles opnieuw ophalen i.p.v. op een halve waarheid door te gaan.
    let lostSinceLastConnect = false

    function markLost() {
      lostSinceLastConnect = true
      setRealtimeLink('lost')
    }

    pb.realtime.onDisconnect = (activeSubscriptions) => {
      // Een lege lijst betekent dat wíj alles opzeggen (uitloggen, unmount)
      // — dat is geen verbindingsverlies.
      if (cancelled || activeSubscriptions.length === 0) return
      markLost()
    }
    window.addEventListener('offline', markLost)

    const subscriptions = [
      pb.realtime.subscribe('PB_CONNECT', () => {
        setRealtimeLink('live')
        if (lostSinceLastConnect) {
          lostSinceLastConnect = false
          fetchAllRef.current()
        }
      }),
      pb.collection('device_state').subscribe('*', (e) => {
        if (e.action === 'delete') return
        setDevices((prev) =>
          prev.map((d) =>
            d.id === e.record.device
              ? // De echte stand is er: niet langer "wacht op de box".
                { ...d, _pending: false, expand: { ...d.expand, device_state_via_device: [e.record] } }
              : d
          )
        )
      }),
      pb.collection('devices').subscribe('*', (e) => {
        if (e.action === 'delete') {
          setDevices((prev) => prev.filter((d) => d.id !== e.record.id))
          return
        }
        // De expand (device_state) zit niet in het event: die bewaren we.
        setDevices((prev) => {
          const existing = prev.find((d) => d.id === e.record.id)
          if (!existing) return [...prev, e.record]
          return prev.map((d) =>
            d.id === e.record.id ? { ...e.record, expand: d.expand, _pending: d._pending } : d
          )
        })
      }),
      pb.collection('houses').subscribe('*', (e) => {
        if (e.action === 'delete') return
        setHouses((prev) => prev.map((h) => (h.id === e.record.id ? e.record : h)))
      }),
    ]

    subscriptions.forEach((subscription) =>
      subscription
        .then((unsub) => {
          if (cancelled) unsub()
          else unsubscribers.push(unsub)
        })
        .catch((err) => {
          console.error('[realtime] Abonneren mislukt:', err)
        })
    )

    return () => {
      cancelled = true
      window.removeEventListener('offline', markLost)
      pb.realtime.onDisconnect = undefined
      unsubscribers.forEach((unsub) => unsub())
    }
  }, [loggedIn])

  async function login(e) {
    e.preventDefault()
    setError('')
    setLoggingIn(true)
    try {
      await pb.collection('users').authWithPassword(email, password)
      setLoggedIn(true)
    } catch (err) {
      // 400 is bij inloggen vrijwel altijd een onjuiste combinatie — dat
      // verdient een specifiekere melding dan "controleer de gegevens".
      setError(
        err?.status === 400
          ? 'Dit e-mailadres en wachtwoord horen niet bij elkaar. Controleer ze en probeer het opnieuw.'
          : describeError('Inloggen', err)
      )
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
    setRealtimeLink('connecting')
    setLoaded(false)
    setError('')
    setFetchFailed(false)
  }

  // Een verlopen sessie is geen fout die je met "opnieuw proberen" oplost:
  // terug naar het inlogscherm, met uitleg waarom.
  function endExpiredSession() {
    logout()
    setError('Je bent automatisch uitgelogd omdat je sessie verlopen is. Log opnieuw in om verder te gaan.')
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
      setLoaded(true)
    } catch (err) {
      if (isSessionExpired(err)) {
        endExpiredSession()
        return
      }
      setError(describeError('Je apparaten ophalen', err))
      setFetchFailed(true)
    }
  }
  // Voor de realtime-effect, die bij herverbinden de nieuwste versie nodig
  // heeft zonder zelf opnieuw te abonneren.
  const fetchAllRef = useRef(fetchAll)
  fetchAllRef.current = fetchAll

  function retryFetch() {
    setFetchFailed(false)
    fetchAll()
  }

  const house = houses[0]
  const houseLink = houseConnection(house, now)
  // Alleen als de box én de verbinding ernaartoe werken, kan een tik iets
  // doen. Anders tonen de kaarten de laatst bekende stand.
  const houseReachable = realtimeLink !== 'lost' && houseLink.reachable
  // Gememoiseerd: roomsInHouse gaat als prop naar elke (gememoiseerde)
  // DeviceCard — een nieuwe array per render zou die memo teniet doen.
  const roomsInHouse = useMemo(() => rooms.filter((room) => room.house === house?.id), [rooms, house?.id])
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

  useEffect(() => {
    setTab(tabFromHash())
    function onHashChange() {
      setTab(tabFromHash())
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function selectTab(id) {
    if (id === tab) return
    window.location.hash = id
    window.scrollTo(0, 0)
  }

  // Vanuit de samenvatting op Home ("staat aan in Woonkamer") meteen naar
  // die kamer.
  function openRoom(roomId) {
    selectRoom(roomId)
    selectTab('kamers')
  }

  // Toont een korte melding rechtsboven die zichzelf weer verwijdert (de
  // fade-out zelf is puur CSS, zie .toast — dit ruimt alleen de state op
  // zodat de DOM-node niet blijft hangen). Fouten blijven langer staan en
  // zijn weg te klikken: een bevestiging mag vluchtig zijn, een fout moet
  // je kunnen lezen.
  function showToast(message, type = 'info') {
    const id = crypto.randomUUID()
    const duration = type === 'error' ? 6000 : 3500
    setToasts((prev) => [...prev, { id, message, type, duration }])
    setTimeout(() => dismissToast(id), duration)
  }

  function dismissToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  const settingsDevice = devices.find((d) => d.id === settingsDeviceId) ?? null

  const roomTabs = [
    ...roomsInHouse.map((room) => ({ id: room.id, label: room.name })),
    ...(unassignedDevices.length > 0 ? [{ id: '__unassigned', label: 'Overig' }] : []),
  ]

  // Welke lampen/stopcontacten staan er aan? Voor de huis-samenvatting en
  // de rij "Staat aan" op Home. Een apparaat dat offline is telt niet mee:
  // van "aan" weten we dan niets zeker.
  const hasSwitchables = devicesInHouse.some((device) => TOGGLEABLE_TYPES.includes(device.type))
  const devicesOn = devicesInHouse.filter(
    (device) =>
      TOGGLEABLE_TYPES.includes(device.type) &&
      device.online &&
      isDeviceOn(device.type, device.expand?.device_state_via_device?.[0]?.state)
  )
  const roomsWithSomethingOn = roomTabs
    .map((tab) => ({
      ...tab,
      onCount: devicesOn.filter((device) =>
        tab.id === '__unassigned' ? !roomIds.includes(device.room) : device.room === tab.id
      ).length,
    }))
    .filter((tab) => tab.onCount > 0)

  // "Staat aan" op Home: alles wat aan staat, behalve de favorieten (die
  // staan er al). Zet je er een uit, dan blijft hij (met "Uit") staan tot
  // je Home verlaat: een tegel die onder je duim verdwijnt, voelt als een
  // fout, en zo kun je hem ook meteen weer aanzetten.
  const onIdsKey = devicesOn.map((device) => device.id).join(',')
  useEffect(() => {
    if (tab !== 'home') {
      setShelfIds((prev) => (prev.length ? [] : prev))
      return
    }
    const onIds = onIdsKey ? onIdsKey.split(',') : []
    setShelfIds((prev) => {
      const added = onIds.filter((id) => !prev.includes(id))
      return added.length ? [...prev, ...added] : prev
    })
  }, [tab, onIdsKey])

  const devicesInSelectedRoom =
    selectedRoomId === '__unassigned'
      ? unassignedDevices
      : devicesInHouse.filter((device) => device.room === selectedRoomId)

  // Optimistisch: de knop flipt meteen, geen "bezig..."-status. Het
  // commando gaat op de achtergrond naar de agent; na een korte wachttijd
  // wordt de echte state opgehaald om eventueel bij te sturen als het toch
  // anders uitpakte (device offline, commando mislukt, etc).
  async function toggleDevice(device) {
    // De kaart biedt voor een offline apparaat geen toggle aan; dit is de
    // vangrail voor het geval de online-status net omsloeg tijdens de tik.
    if (!houseReachable) {
      showToast('Je Sandhovius-box is nu niet bereikbaar. Probeer het opnieuw zodra hij weer reageert.', 'error')
      return
    }
    if (!device.online) {
      showToast(`${device.name} is offline`, 'error')
      return
    }
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
          ? // _pending: de tik is een voornemen tot de box het bevestigt. De
            // tegel zegt dan "Aan…" met een zwakke gloed (zie DeviceCard).
            { ...d, _pending: true, expand: { ...d.expand, device_state_via_device: [optimisticState] } }
          : d
      )
    )
    // Geen melding bij elke tik: de tegel zelf ("Aan"/"Uit", het licht dat
    // opgloeit of dooft) is de bevestiging, zoals bij een echte lichtknop. Een melding
    // komt er alleen als het traag gaat of mislukt (watchCommand).

    // Eén foutmelding per fout: de (blijvende, wegklikbare) fouttoast. De
    // banner bovenaan is voor het ophalen van de hele pagina.
    try {
      const command = await pb.collection('commands').create({
        device: device.id,
        action: 'toggle',
        status: 'pending',
      })
      watchCommand(command.id, device.name, device.id)
    } catch (err) {
      if (isSessionExpired(err)) return endExpiredSession()
      showToast(describeError(`${device.name} ${willBeOn ? 'inschakelen' : 'uitschakelen'}`, err), 'error')
      fetchAll()
    }
  }

  // Zelfde optimistisch patroon als toggleDevice, maar voor climate-
  // entities: het doel zit genest onder attributes.temperature i.p.v. het
  // vlakke state-veld dat lampen/switches gebruiken.
  async function setDeviceTemperature(device, temperature) {
    if (!houseReachable) {
      showToast('Je Sandhovius-box is nu niet bereikbaar. Probeer het opnieuw zodra hij weer reageert.', 'error')
      return
    }
    const stateRecord = device.expand?.device_state_via_device?.[0]
    const optimisticState = {
      ...stateRecord,
      state: {
        ...stateRecord?.state,
        attributes: { ...stateRecord?.state?.attributes, temperature },
      },
    }

    setDevices((prev) =>
      prev.map((d) =>
        d.id === device.id
          ? { ...d, expand: { ...d.expand, device_state_via_device: [optimisticState] } }
          : d
      )
    )
    try {
      const command = await pb.collection('commands').create({
        device: device.id,
        action: 'set_temperature',
        payload: { temperature },
        status: 'pending',
      })
      watchCommand(command.id, device.name)
    } catch (err) {
      if (isSessionExpired(err)) return endExpiredSession()
      showToast(describeError(`${device.name} op ${temperature}°C zetten`, err), 'error')
      fetchAll()
    }
  }

  // Luistert mee op één commando tot de agent het afhandelt. Succes heeft
  // geen melding nodig: de echte stand komt via de realtime device_state
  // binnen en bevestigt (of corrigeert) de optimistische kaart. Een
  // melding komt er alleen als het traag gaat of mislukt — en dan halen we
  // de echte stand opnieuw op, zodat de kaart niet blijft doen alsof.
  function watchCommand(commandId, deviceName, deviceId) {
    let unsub
    let stopped = false
    const slowTimer = setTimeout(() => {
      showToast(`${deviceName} reageert nog niet. Even geduld…`)
    }, COMMAND_SLOW_MS)
    const giveUpTimer = setTimeout(() => {
      if (stopped) return
      stop()
      showToast(`${deviceName} heeft niet gereageerd. Je ziet weer de laatst bekende stand.`, 'error')
      fetchAll()
    }, COMMAND_GIVE_UP_MS)

    function stop() {
      if (stopped) return
      stopped = true
      clearTimeout(slowTimer)
      clearTimeout(giveUpTimer)
      unsub?.()
    }

    pb.collection('commands')
      .subscribe(commandId, (e) => {
        if (e.record.status === 'pending') return
        stop()
        // De box heeft het uitgevoerd: dat is de bevestiging, ook als de
        // nieuwe stand (device_state) nog onderweg is.
        if (e.record.status !== 'failed' && deviceId) {
          setDevices((prev) => prev.map((d) => (d.id === deviceId && d._pending ? { ...d, _pending: false } : d)))
        }
        // De agent-foutmelding (e.record.error) is technisch en Engels —
        // die hoort in de console, niet in de melding voor de bewoner.
        if (e.record.status === 'failed') {
          console.error('[command] mislukt:', e.record.error)
          showToast(
            `${deviceName} reageerde niet. Controleer of het apparaat stroom heeft en probeer het opnieuw.`,
            'error'
          )
          fetchAll()
        }
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
        // offline) vangt de giveUpTimer het op met een fetchAll.
      })
  }

  async function toggleFavorite(device) {
    await saveDevice(device.id, { favorite: !device.favorite })
  }

  async function saveDevice(deviceId, updates) {
    const updated = await pb.collection('devices').update(deviceId, updates)
    setDevices((prev) => prev.map((d) => (d.id === deviceId ? { ...d, ...updated } : d)))
  }

  async function deleteDevice(deviceId) {
    await pb.collection('devices').delete(deviceId)
    setDevices((prev) => prev.filter((d) => d.id !== deviceId))
  }

  // Na toevoegen spring je naar de kamer van het nieuwe apparaat, zodat je
  // zijn kaart ziet klaargezet worden. De realtime devices-subscription
  // kan hem al binnen hebben gebracht: dan niet dubbel toevoegen.
  async function createDevice(fields) {
    // Zolang Home nog geen favorieten heeft, komt een nieuw apparaat daar
    // meteen op te staan: je eerste lamp moet je direct kunnen aanzetten,
    // niet eerst via Kamers opzoeken. De thermostaat staat er altijd al.
    const favorite = fields.type !== 'climate' && !devicesInHouse.some((d) => d.favorite && d.type !== 'climate')
    const created = await pb
      .collection('devices')
      .create({ ...fields, favorite, gateway: house.id, online: false })
    setDevices((prev) => (prev.some((d) => d.id === created.id) ? prev : [...prev, created]))
    setNewDeviceIds((prev) => [...prev, created.id])
    setTimeout(() => setNewDeviceIds((prev) => prev.filter((id) => id !== created.id)), NEW_DEVICE_GRACE_MS)
    selectRoom(created.room || '__unassigned')
    // Via "+" onderin kun je vanaf elk tabblad toevoegen. Komt het nieuwe
    // apparaat niet op Home te staan, spring dan naar zijn kamer, zodat je
    // het ziet klaargezet worden.
    if (tab !== 'kamers' && !favorite) selectTab('kamers')
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

  // Stabiele handlers voor de (gememoiseerde) DeviceCards: één object dat
  // nooit van identiteit verandert, maar altijd de nieuwste versie van de
  // functies hierboven aanroept via de ref. Zo her-rendert een kaart alleen
  // als zijn eigen device, de kamers of zijn animatie-status verandert —
  // niet bij elke toast, modal of realtime-tik op de pagina.
  const latest = useRef(null)
  latest.current = { toggleDevice, setDeviceTemperature }
  const cardHandlers = useMemo(
    () => ({
      onToggle: (device) => latest.current.toggleDevice(device),
      onSetTemperature: (device, temperature) => latest.current.setDeviceTemperature(device, temperature),
      onOpenSettings: (device) => setSettingsDeviceId(device.id),
    }),
    []
  )

  if (!loggedIn) {
    return (
      <main className="login-page">
        <div className="login-card">
          <h1 className="login-title">Sandhovius</h1>
          {/* Zichtbare labels i.p.v. alleen placeholders: een placeholder
              verdwijnt zodra je begint te typen. autoComplete laat de
              wachtwoordbeheerder van de telefoon het formulier invullen. */}
          <form onSubmit={login} className="form-stack">
            <label className="form-field">
              <span className="form-label">E-mailadres</span>
              <input
                className="input"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="form-field">
              <span className="form-label">Wachtwoord</span>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary" disabled={loggingIn}>
              {loggingIn ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Bezig met inloggen…
                </>
              ) : (
                'Inloggen'
              )}
            </button>
          </form>
        </div>
      </main>
    )
  }

  const roomNameById = Object.fromEntries(roomsInHouse.map((room) => [room.id, room.name]))
  const climateDevices = devicesInHouse.filter((device) => device.type === 'climate')
  // De thermostaat staat altijd op Home; de rest alleen als favoriet.
  const favoriteDevices = devicesInHouse.filter((device) => device.favorite && device.type !== 'climate')
  // Alleen als de box bereikbaar is: anders weten we niet zeker wat er aan
  // staat (net als de samenvatting).
  const shelfDevices = houseReachable
    ? devicesInHouse.filter((device) => shelfIds.includes(device.id) && !device.favorite)
    : []
  const userEmail = pb.authStore.record?.email

  const errorBanner = error && (
    <div className="error-banner" role="alert">
      <span>{error}</span>
      {fetchFailed && (
        <button type="button" className="btn btn-secondary error-banner-action" onClick={retryFetch}>
          Opnieuw proberen
        </button>
      )}
    </div>
  )

  const skeleton = !loaded && !error && (
    // Plaatshouders in de vorm van tegels, zodat het scherm niet leeg is en
    // niet verspringt als de apparaten binnenkomen.
    <ul className="device-list" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className={`device-cell ${i === 0 ? 'device-cell-climate' : ''}`}>
          <div className="panel tile card-skeleton" />
        </li>
      ))}
    </ul>
  )

  const noHouse = loaded && !house && (
    <p className="empty-state">
      Er is nog geen huis aan je account gekoppeld. Zodra je Sandhovius-box aan je account gekoppeld is, verschijnt
      je huis hier.
    </p>
  )

  // Eerste gebruik: nog geen enkel apparaat. De vier soorten staan er als
  // doofde lampjes, met de actie binnen bereik van je duim in plaats van
  // alleen "Toevoegen" bovenaan.
  const firstDevice = loaded && house && devicesInHouse.length === 0 && (
    <section className="panel intro-panel" aria-labelledby="first-device-title">
      <div className="intro-panel-icons" aria-hidden="true">
        {['light', 'switch', 'sensor', 'climate'].map((type) => {
          const Icon = deviceTypeIcon(type)
          return (
            <span key={type} className="device-icon">
              <Icon width="22" height="22" />
            </span>
          )
        })}
      </div>
      <h2 id="first-device-title" className="intro-panel-title">
        Voeg je eerste apparaat toe
      </h2>
      <p className="intro-panel-text">
        Een lamp, stopcontact, sensor of thermostaat. Hij verschijnt meteen op Home, zodat je hem met één tik bedient.
      </p>
      <button type="button" className="btn btn-primary" onClick={() => setAddDeviceOpen(true)}>
        <PlusIcon width="20" height="20" aria-hidden="true" />
        Apparaat toevoegen
      </button>
    </section>
  )

  function renderDevices(list, { showRoom = false } = {}) {
    return (
      <ul className="device-list">
        {list.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            context={showRoom ? roomNameById[device.room] ?? 'Geen kamer' : undefined}
            houseReachable={houseReachable}
            isNew={newDeviceIds.includes(device.id)}
            {...cardHandlers}
          />
        ))}
      </ul>
    )
  }

  const addDeviceButton = house && (
    <button
      type="button"
      className="btn btn-primary btn-add"
      aria-label="Apparaat toevoegen"
      onClick={() => setAddDeviceOpen(true)}
    >
      <PlusIcon width="20" height="20" aria-hidden="true" />
      Toevoegen
    </button>
  )

  let header
  let content
  if (tab === 'kamers') {
    const count = devicesInSelectedRoom.length
    header = <Header title="Kamers" action={addDeviceButton} />
    content = (
      <>
        {errorBanner}
        {noHouse}
        {roomTabs.length > 0 && (
          <div className="rooms-bar">
            <RoomTabs tabs={roomTabs} selectedId={selectedRoomId} onSelect={selectRoom} />
          </div>
        )}
        {loaded && house && count > 0 && (
          <p className="section-count">{count === 1 ? '1 apparaat' : `${count} apparaten`}</p>
        )}
        {firstDevice}
        {loaded && house && count === 0 && devicesInHouse.length > 0 && (
          <p className="empty-state">
            Nog geen apparaten in deze kamer. Voeg er een toe met "Toevoegen", of verplaats een apparaat hierheen via
            Details.
          </p>
        )}
        {skeleton}
        {renderDevices(devicesInSelectedRoom)}
      </>
    )
  } else if (tab === 'scenes') {
    // Scènes zijn de volgende functie. Tot die er is: eerlijk zeggen wat
    // het wordt, zonder knoppen die nog niets doen.
    header = <Header title="Scènes" />
    content = (
      <section className="panel intro-panel" aria-labelledby="scenes-soon-title">
        <div className="intro-panel-icons" aria-hidden="true">
          <span className="device-icon">
            <ScenesIcon width="22" height="22" />
          </span>
        </div>
        <h2 id="scenes-soon-title" className="intro-panel-title">
          Scènes komen eraan
        </h2>
        <p className="intro-panel-text">
          Met een scène zet je met één tik meerdere apparaten tegelijk goed, bijvoorbeeld "Naar bed": alle lampen uit
          en de verwarming lager. Zodra het klaar is, vind je het hier.
        </p>
      </section>
    )
  } else if (tab === 'instellingen') {
    header = <Header title="Instellingen" />
    content = (
      <>
        {errorBanner}
        <SettingsView
          house={house}
          roomCount={roomsInHouse.length}
          userEmail={userEmail}
          onOpenHouse={() => setHouseModalOpen(true)}
          onLogout={logout}
        />
      </>
    )
  } else {
    header = <Header title="Welkom thuis" subtitle={formatToday(now)} />
    content = (
      <>
        {errorBanner}
        {noHouse}
        <div className="dashboard">
          {house && (
            <HousePanel
              house={house}
              realtimeLink={realtimeLink}
              houseLink={houseLink}
              now={now}
              // Alleen als de box bereikbaar is: anders weten we niet zeker
              // wat er aan staat, en zegt de verbindingsmelding genoeg.
              summary={
                loaded && houseReachable && hasSwitchables
                  ? {
                      rooms: roomsWithSomethingOn,
                      lights: devicesOn.filter((device) => device.type === 'light').length,
                      switches: devicesOn.filter((device) => device.type === 'switch').length,
                      onSelectRoom: openRoom,
                    }
                  : null
              }
            />
          )}

          <div className="dashboard-devices" style={{ '--favorites': favoriteDevices.length }}>
            {skeleton}

            {firstDevice}

            {loaded && house && devicesInHouse.length > 0 && (
              <div className="home-main">
                <section className="home-section" aria-labelledby="home-favorites">
                  <h2 id="home-favorites" className="section-heading">
                    Favorieten
                  </h2>
                  {favoriteDevices.length > 0 ? (
                    renderDevices(favoriteDevices, { showRoom: true })
                  ) : (
                    <p className="section-hint">
                      Zet apparaten die je vaak gebruikt hier: open een apparaat via Details en zet "Op Home tonen"
                      aan.
                    </p>
                  )}
                </section>

                {shelfDevices.length > 0 && (
                  <section className="home-section" aria-labelledby="home-on">
                    <h2 id="home-on" className="section-heading">
                      Staat aan
                    </h2>
                    {renderDevices(shelfDevices, { showRoom: true })}
                  </section>
                )}
              </div>
            )}

            {loaded && house && climateDevices.length > 0 && (
              <section className="home-section" aria-labelledby="home-climate">
                <h2 id="home-climate" className="section-heading">
                  Temperatuur
                </h2>
                {renderDevices(climateDevices, { showRoom: true })}
              </section>
            )}

          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {header}

      <main className="container">{content}</main>

      <BottomNav activeTab={tab} onSelect={selectTab} onAdd={house ? () => setAddDeviceOpen(true) : null} />

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
          defaultRoomId={selectedRoomId === '__unassigned' ? '' : selectedRoomId}
          onCreate={createDevice}
          onClose={() => setAddDeviceOpen(false)}
        />
      )}

      {settingsDevice && (
        <DeviceSettingsModal
          key={settingsDevice.id}
          device={settingsDevice}
          rooms={roomsInHouse}
          onSave={saveDevice}
          onSaveError={(message) => showToast(message, 'error')}
          onToggleFavorite={toggleFavorite}
          onDelete={deleteDevice}
          onClose={() => setSettingsDeviceId(null)}
        />
      )}
    </>
  )
}
