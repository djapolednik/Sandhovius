'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import PocketBase, { LocalAuthStore } from 'pocketbase'
import Header from '../components/Header'
import DeviceCard, { TOGGLEABLE_TYPES, isDeviceOn } from '../components/DeviceCard'
import DeviceSettingsModal from '../components/DeviceSettingsModal'
import HousePanel from '../components/HousePanel'
import { WeatherCard } from '../components/Weather'
import HomeScenes from '../components/HomeScenes'
import PullToRefresh from '../components/PullToRefresh'
import HouseModal from '../components/HouseModal'
import AddDeviceModal from '../components/AddDeviceModal'
import ToastContainer from '../components/ToastContainer'
import BottomNav, { TABS } from '../components/BottomNav'
import RoomTabs from '../components/RoomTabs'
import SettingsView from '../components/SettingsView'
import FavoritesOrderModal from '../components/FavoritesOrderModal'
import ChangePasswordModal from '../components/ChangePasswordModal'
import SignupForm from '../components/SignupForm'
import ClaimSheet from '../components/ClaimSheet'
import { pendingKey } from '../lib/claim'
import { describeError, isSessionExpired } from '../lib/errors'
import { houseConnection } from '../lib/connection'
import { useNow } from '../lib/useNow'
import { isBatteryLow } from '../lib/battery'
import { PlusIcon, deviceTypeIcon } from '../lib/icons'
import ScenesView from '../components/ScenesView'
import SceneModal from '../components/SceneModal'

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
// Wat Home laat zien: je favorieten of alles wat aan staat.
const HOME_VIEW_KEY = 'sandhovius-home-view'
const SELECTED_HOUSE_KEY = 'sandhovius-selected-house'
// Zo lang mag het klaarzetten van een nieuw apparaat duren voordat de kaart
// het niet meer "Wordt klaargezet" noemt (normaal: een paar seconden).
const NEW_DEVICE_GRACE_MS = 2 * 60 * 1000
// Een commando dat na zo lang nog niet is afgehandeld krijgt een "even
// geduld"-melding; na de tweede grens geven we het op en tonen we weer de
// echte stand.
const COMMAND_SLOW_MS = 4000
const COMMAND_GIVE_UP_MS = 15000
// Zo lang kun je iets terugdraaien ("Ongedaan maken"): de melding staat er
// even lang, en een verwijdering gebeurt pas daarna echt.
const UNDO_MS = 6000
// Na een geslaagde login: zo lang gaan de lampen in het huis aan en
// verdwijnt het formulier voordat Home verschijnt (zie login.css). Met
// minder beweging alleen een korte vervaging.
const ARRIVE_MS = 650
const ARRIVE_REDUCED_MS = 300
// Zo lang heeft Home de klasse .arriving (de binnenkomst in base.css).
const ARRIVE_IN_MS = 600

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [arriving, setArriving] = useState(false)

  const [houses, setHouses] = useState([])
  const [rooms, setRooms] = useState([])
  const [devices, setDevices] = useState([])
  const [scenes, setScenes] = useState([])
  const [schedules, setSchedules] = useState([])
  // Scène die nu loopt of net klaar is: { [sceneId]: 'running' | 'done' }.
  const [sceneRunState, setSceneRunState] = useState({})
  // Open scène-sheet: 'new', een scène-ID, of null.
  const [editingScene, setEditingScene] = useState(null)
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
  // Koppelsheet: null (dicht) of { initial } met de code uit een link/QR.
  const [claim, setClaim] = useState(null)
  const [addDeviceOpen, setAddDeviceOpen] = useState(false)
  const [settingsDeviceId, setSettingsDeviceId] = useState(null)
  const [shelfIds, setShelfIds] = useState([])
  const [orderingFavorites, setOrderingFavorites] = useState(false)
  const [homeView, setHomeView] = useState('favorites')
  useEffect(() => {
    try {
      if (window.localStorage.getItem(HOME_VIEW_KEY) === 'on') setHomeView('on')
    } catch {}
  }, [])
  function chooseHomeView(view) {
    setHomeView(view)
    try {
      window.localStorage.setItem(HOME_VIEW_KEY, view)
    } catch {}
  }
  const [changingPassword, setChangingPassword] = useState(false)
  // Inlogscherm: "Wachtwoord vergeten?" wisselt naar een formulier dat een
  // resetlink laat mailen; resetSent toont daarna de bevestiging.
  const [resetMode, setResetMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [signupMode, setSignupMode] = useState(false)
  // Meerdere huizen (bv. thuis en een vakantiehuis): welk huis je bekijkt,
  // onthouden op dit apparaat. Zonder keuze het eerste.
  const [selectedHouseId, setSelectedHouseId] = useState(null)
  useEffect(() => {
    try {
      setSelectedHouseId(window.localStorage.getItem(SELECTED_HOUSE_KEY))
    } catch {
      // Geen opslag: dan het eerste huis.
    }
  }, [])
  // Apparaten die je in deze sessie net toevoegde: hun kaart zegt "Wordt
  // klaargezet" i.p.v. "Offline" tot de box ze gekoppeld heeft.
  const [newDeviceIds, setNewDeviceIds] = useState([])
  // Verwijderd, maar nog even terug te halen ("Ongedaan maken"): apparaten
  // en kamers die al uit beeld zijn, en pas na UNDO_MS echt weg gaan.
  const [hiddenIds, setHiddenIds] = useState([])
  const deleteTimers = useRef({})

  useEffect(() => {
    setLoggedIn(pb.authStore.isValid)
  }, [])

  useEffect(() => {
    if (loggedIn) {
      fetchAll()
    }
  }, [loggedIn])

  // Een koppelcode uit de QR-link (/koppel) wacht in sessionStorage: zodra
  // je ingelogd bent opent de koppelsheet daarmee.
  useEffect(() => {
    if (!loggedIn) return
    try {
      const pending = window.sessionStorage.getItem(pendingKey)
      if (pending) setClaim({ initial: JSON.parse(pending) })
    } catch {}
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
      // De agent schrijft last_run/last_error: zo ziet de scène-sheet dat live.
      pb.collection('schedules').subscribe('*', (e) => {
        setSchedules((prev) =>
          e.action === 'delete'
            ? prev.filter((s) => s.id !== e.record.id)
            : [...prev.filter((s) => s.id !== e.record.id), e.record]
        )
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
      // Pas nu het inloggen bevestigd is: de lampen gaan aan, het formulier
      // verdwijnt, en dan komt Home binnen. Nooit eerder, want dan zou het
      // huis een geslaagde login beloven die nog niet vaststaat.
      setArriving(true)
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      await new Promise((resolve) => setTimeout(resolve, reduce ? ARRIVE_REDUCED_MS : ARRIVE_MS))
      // Na inloggen altijd naar Home, ook als de URL nog op het tabblad van
      // vóór het uitloggen staat (#instellingen). replaceState, zodat de
      // terugknop niet naar dat oude tabblad springt.
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      setTab('home')
      window.scrollTo(0, 0)
      document.documentElement.classList.add('arriving')
      setTimeout(() => document.documentElement.classList.remove('arriving'), ARRIVE_IN_MS)
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
      setArriving(false)
    }
  }

  // Altijd dezelfde bevestiging, of het adres nu bekend is of niet: zo kan
  // niemand via dit formulier uitzoeken wie een account heeft.
  async function requestReset(e) {
    e.preventDefault()
    setError('')
    setLoggingIn(true)
    try {
      await pb.collection('users').requestPasswordReset(email)
      setResetSent(true)
    } catch (err) {
      setError(describeError('De resetlink versturen', err))
    } finally {
      setLoggingIn(false)
    }
  }

  // Na het wijzigen is het oude inlogtoken ongeldig: meteen opnieuw
  // inloggen met het nieuwe wachtwoord, zodat je ingelogd blijft.
  async function changePassword(oldPassword, newPassword) {
    const record = pb.authStore.record
    await pb.collection('users').update(record.id, {
      oldPassword,
      password: newPassword,
      passwordConfirm: newPassword,
    })
    await pb.collection('users').authWithPassword(record.email, newPassword)
    showToast('Je wachtwoord is gewijzigd')
  }

  async function changeLanguage(language) {
    await pb.collection('users').update(pb.authStore.record.id, { language })
  }

  // Na het koppelen: huizen opnieuw ophalen en het nieuwe huis tonen.
  async function boxClaimed(houseId) {
    await fetchAll()
    selectHouse(houseId)
  }

  // Box loskoppelen: het huis en alles erin blijft.
  async function releaseBox(houseId) {
    await pb.send('/api/sandhovius/release', { method: 'POST', body: { house: houseId } })
    await fetchAll()
    showToast('Je box is ontkoppeld')
  }

  function logout() {
    pb.authStore.clear()
    // Een koppelcode uit een QR-link hoort niet bij de volgende die inlogt.
    try {
      window.sessionStorage.removeItem(pendingKey)
    } catch {}
    setClaim(null)
    setLoggedIn(false)
    setHouses([])
    setRooms([])
    setDevices([])
    setScenes([])
    setSchedules([])
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
      const [houseRecords, roomRecords, deviceRecords, sceneRecords, scheduleRecords] = await Promise.all([
        pb.collection('houses').getFullList(),
        pb.collection('rooms').getFullList({ sort: 'order' }),
        pb.collection('devices').getFullList({ expand: 'device_state_via_device' }),
        pb.collection('scenes').getFullList({ sort: 'order,name' }),
        pb.collection('schedules').getFullList({ sort: 'time' }),
      ])
      setHouses(houseRecords)
      setRooms(roomRecords)
      setDevices(deviceRecords)
      setScenes(sceneRecords)
      setSchedules(scheduleRecords)
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

  const house = houses.find((h) => h.id === selectedHouseId) ?? houses[0]

  function selectHouse(houseId) {
    setSelectedHouseId(houseId)
    setShelfIds([])
    try {
      window.localStorage.setItem(SELECTED_HOUSE_KEY, houseId)
    } catch {
      // Geen opslag: de keuze geldt dan alleen nu.
    }
  }
  const houseLink = houseConnection(house, now)
  // Alleen als de box én de verbinding ernaartoe werken, kan een tik iets
  // doen. Anders tonen de kaarten de laatst bekende stand.
  const houseReachable = realtimeLink !== 'lost' && houseLink.reachable
  // Gememoiseerd: roomsInHouse gaat als prop naar elke (gememoiseerde)
  // DeviceCard — een nieuwe array per render zou die memo teniet doen.
  // Op volgorde (Opties → Huis → pijltjes), ook na lokale wijzigingen.
  const roomsInHouse = useMemo(
    () =>
      rooms
        .filter((room) => room.house === house?.id && !hiddenIds.includes(room.id))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [rooms, house?.id, hiddenIds]
  )
  const devicesInHouse = devices.filter((device) => device.gateway === house?.id && !hiddenIds.includes(device.id))
  const scenesInHouse = scenes.filter((scene) => scene.house === house?.id && !hiddenIds.includes(scene.id))
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

  // Een ander tabblad komt rustig binnen: vervagen en 12px schuiven,
  // van rechts als het tabblad rechts in de navigatie staat (Home → Kamers),
  // van links als je teruggaat. Geen uitgang: het nieuwe tabblad staat er
  // meteen. Met minder beweging alleen de fade. Niet bij het binnenkomen na
  // inloggen, dat heeft zijn eigen animatie (.arriving).
  // Naar boven scrollen gebeurt hier, vóór de eerste paint van het nieuwe
  // tabblad: anders zie je eerst het oude tabblad verspringen. will-change
  // alleen tijdens de animatie: dan tekent de browser het tabblad één keer
  // en schuift hij alleen die laag, in plaats van tekst en gloed elk frame
  // opnieuw te tekenen (dat hapert).
  const tabViewRef = useRef(null)
  const previousTabRef = useRef(tab)
  useLayoutEffect(() => {
    const previous = previousTabRef.current
    previousTabRef.current = tab
    const view = tabViewRef.current
    if (previous === tab || !view) return
    window.scrollTo(0, 0)
    if (document.documentElement.classList.contains('arriving')) return
    const order = (id) => TABS.findIndex((t) => t.id === id)
    const direction = order(tab) > order(previous) ? 1 : -1
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    view.getAnimations().forEach((animation) => animation.cancel())
    view.style.willChange = 'transform, opacity'
    const animation = view.animate(
      reduce
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: `translateX(${direction * 12}px)` },
            { opacity: 1, transform: 'none' },
          ],
      { duration: reduce ? 150 : 300, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    )
    animation.onfinish = () => {
      view.style.willChange = ''
    }
  }, [tab])

  function selectTab(id) {
    if (id === tab) return
    window.location.hash = id
  }

  // Toont een korte melding rechtsboven die zichzelf weer verwijdert (de
  // fade-out zelf is puur CSS, zie .toast — dit ruimt alleen de state op
  // zodat de DOM-node niet blijft hangen). Fouten blijven langer staan en
  // zijn weg te klikken: een bevestiging mag vluchtig zijn, een fout moet
  // je kunnen lezen.
  function showToast(message, type = 'info', action) {
    const id = crypto.randomUUID()
    const duration = type === 'error' || action ? UNDO_MS : 3500
    setToasts((prev) => [...prev, { id, message, type, duration, action }])
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

  // Welke lampen/stopcontacten staan er aan? Voor "Alles uit" en de rij
  // "Staat aan" op Home. Een apparaat dat offline is telt niet mee: van
  // "aan" weten we dan niets zeker.
  const devicesOn = devicesInHouse.filter(
    (device) =>
      TOGGLEABLE_TYPES.includes(device.type) &&
      device.online &&
      isDeviceOn(device.type, device.expand?.device_state_via_device?.[0]?.state)
  )
  // "Let op" in het huis-paneel: wat de bewoner zelf moet oplossen, op één
  // plek i.p.v. verspreid over tegels in verschillende kamers. Alleen als
  // de box bereikbaar is: anders is álles onbekend en zegt de
  // verbindingsmelding genoeg. Net toegevoegde apparaten tellen nog niet.
  const attention = houseReachable
    ? devicesInHouse.flatMap((device) => {
        if (newDeviceIds.includes(device.id)) return []
        if (!device.entity_id) return [{ device, reason: 'klaarzetten is niet gelukt' }]
        if (!device.online) return [{ device, reason: 'offline' }]
        const battery = device.expand?.device_state_via_device?.[0]?.state?.battery
        if (isBatteryLow(battery)) return [{ device, reason: `batterij bijna leeg (${battery}%)` }]
        return []
      })
    : []

  // "Staat aan" op Home: alles wat aan staat, ook favorieten. Zet je er een uit, dan blijft hij (met "Uit") staan tot
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
      // De verwarming uitzetten is het ene schakelen met echte gevolgen
      // (een koud huis): even terug te draaien.
      if (device.type === 'climate' && !willBeOn) {
        showToast('Verwarming uitgezet', 'info', {
          label: 'Ongedaan maken',
          onClick: () => setSwitches([device], true),
        })
      }
    } catch (err) {
      if (isSessionExpired(err)) return endExpiredSession()
      showToast(describeError(`${device.name} ${willBeOn ? 'inschakelen' : 'uitschakelen'}`, err), 'error')
      fetchAll()
    }
  }

  // Meerdere apparaten tegelijk aan of uit: "Alles uit", en het
  // terugdraaien daarvan of van "verwarming uit". Expliciet turn_on /
  // turn_off i.p.v. toggle, zodat twee keer "uit" gewoon uit blijft. Zelfde
  // voornemen-tot-bevestiging als een tik (_pending).
  async function setSwitches(list, on) {
    if (!houseReachable) {
      showToast('Je Sandhovius-box is nu niet bereikbaar. Probeer het opnieuw zodra hij weer reageert.', 'error')
      return false
    }
    const ids = list.map((device) => device.id)
    setDevices((prev) =>
      prev.map((d) => {
        if (!ids.includes(d.id)) return d
        const stateRecord = d.expand?.device_state_via_device?.[0]
        const value = on ? (d.type === 'climate' ? 'heat' : 'on') : 'off'
        const optimisticState = { ...stateRecord, state: { ...stateRecord?.state, state: value } }
        return { ...d, _pending: true, expand: { ...d.expand, device_state_via_device: [optimisticState] } }
      })
    )
    await Promise.all(
      list.map(async (device) => {
        try {
          // requestKey: null — anders annuleert de SDK gelijktijdige
          // verzoeken naar hetzelfde adres, en gaat maar één lamp uit.
          const command = await pb.collection('commands').create(
            { device: device.id, action: on ? 'turn_on' : 'turn_off', status: 'pending' },
            { requestKey: null }
          )
          watchCommand(command.id, device.name, device.id)
        } catch (err) {
          if (isSessionExpired(err)) return endExpiredSession()
          showToast(describeError(`${device.name} ${on ? 'inschakelen' : 'uitschakelen'}`, err), 'error')
          fetchAll()
        }
      })
    )
    return true
  }

  // "Alles uit" in het huis-paneel: elke lamp en elk stopcontact dat aan
  // staat. Hier wél een melding, want je ziet niet alle tegels tegelijk, en
  // met "Ongedaan maken" gaat precies hetzelfde rijtje weer aan.
  async function turnAllOff() {
    const list = devicesOn
    if (list.length === 0 || !(await setSwitches(list, false))) return
    showToast(list.length === 1 ? `${list[0].name} gaat uit` : `${list.length} apparaten gaan uit`, 'info', {
      label: 'Ongedaan maken',
      onClick: () => setSwitches(list, true),
    })
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
  // options.onSettled(status): voor wie wil weten hoe het afliep (een
  // scène-tegel). options.failMessage: eigen tekst bij mislukken.
  function watchCommand(commandId, deviceName, deviceId, options = {}) {
    let unsub
    let stopped = false
    const slowTimer = setTimeout(() => {
      showToast(`${deviceName} reageert nog niet. Even geduld…`)
    }, COMMAND_SLOW_MS)
    const giveUpTimer = setTimeout(() => {
      if (stopped) return
      stop()
      options.onSettled?.('failed')
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
        options.onSettled?.(e.record.status)
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
            options.failMessage ??
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

  // Een nieuwe favoriet komt achteraan.
  async function toggleFavorite(device) {
    const last = Math.max(0, ...devicesInHouse.filter((d) => d.favorite).map((d) => d.favorite_order ?? 0))
    await saveDevice(device.id, device.favorite ? { favorite: false } : { favorite: true, favorite_order: last + 1 })
  }

  // Eén plek omhoog of omlaag in een geordende lijst. Daarna krijgt de hele
  // lijst oplopende nummers (0, 1, 2 …), zodat gelijke of lege nummers van
  // vroeger vanzelf verdwijnen; alleen wat echt veranderde gaat naar de
  // server. Mislukt dat, dan de echte volgorde weer ophalen.
  async function moveInList(list, id, delta, field, collection, setList) {
    const from = list.findIndex((item) => item.id === id)
    const to = from + delta
    if (from === -1 || to < 0 || to >= list.length) return
    const next = [...list]
    ;[next[from], next[to]] = [next[to], next[from]]
    const changed = next.filter((item, index) => (item[field] ?? 0) !== index || item.id === id)
    const position = Object.fromEntries(next.map((item, index) => [item.id, index]))
    setList((prev) => prev.map((item) => (item.id in position ? { ...item, [field]: position[item.id] } : item)))
    try {
      await Promise.all(
        changed.map((item) =>
          pb.collection(collection).update(item.id, { [field]: position[item.id] }, { requestKey: null })
        )
      )
    } catch (err) {
      showToast(describeError('Volgorde opslaan', err), 'error')
      fetchAll()
    }
  }

  function moveRoom(roomId, delta) {
    moveInList(roomsInHouse, roomId, delta, 'order', 'rooms', setRooms)
  }

  function moveFavorite(deviceId, delta) {
    moveInList(favoriteDevices, deviceId, delta, 'favorite_order', 'devices', setDevices)
  }

  async function saveDevice(deviceId, updates) {
    const updated = await pb.collection('devices').update(deviceId, updates)
    setDevices((prev) => prev.map((d) => (d.id === deviceId ? { ...d, ...updated } : d)))
  }

  // Verwijderen met een vangnet: meteen uit beeld, met "Ongedaan maken" in
  // de melding, en pas na UNDO_MS echt weg. Sluit je de app binnen die
  // tijd, dan blijft het bestaan: dat is de veilige kant.
  function deleteLater(id, label, commit, onDone) {
    setHiddenIds((prev) => [...prev, id])
    const unhide = () => setHiddenIds((prev) => prev.filter((hidden) => hidden !== id))
    deleteTimers.current[id] = setTimeout(async () => {
      delete deleteTimers.current[id]
      try {
        await commit()
        onDone()
      } catch (err) {
        showToast(describeError(`${label} verwijderen`, err), 'error')
      }
      unhide()
    }, UNDO_MS)
    showToast(`${label} verwijderd`, 'info', {
      label: 'Ongedaan maken',
      onClick: () => {
        clearTimeout(deleteTimers.current[id])
        delete deleteTimers.current[id]
        unhide()
      },
    })
  }

  async function deleteDevice(deviceId) {
    const device = devices.find((d) => d.id === deviceId)
    deleteLater(
      deviceId,
      `"${device?.name ?? 'Apparaat'}"`,
      () => pb.collection('devices').delete(deviceId),
      () => setDevices((prev) => prev.filter((d) => d.id !== deviceId))
    )
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
    const room = rooms.find((r) => r.id === roomId)
    deleteLater(
      roomId,
      `Kamer "${room?.name ?? ''}"`,
      () => pb.collection('rooms').delete(roomId),
      () => setRooms((prev) => prev.filter((r) => r.id !== roomId))
    )
  }

  // Stabiele handlers voor de (gememoiseerde) DeviceCards: één object dat
  // nooit van identiteit verandert, maar altijd de nieuwste versie van de
  // functies hierboven aanroept via de ref. Zo her-rendert een kaart alleen
  // als zijn eigen device, de kamers of zijn animatie-status verandert —
  // niet bij elke toast, modal of realtime-tik op de pagina.
  // "Opnieuw proberen" bij een apparaat waarvan het klaarzetten mislukte:
  // de agent maakt de Home Assistant-helper alsnog aan. De tegel staat
  // intussen weer op "Wordt klaargezet" (isNew); lukt het niet, dan zegt
  // watchCommand dat.
  async function retrySetup(device) {
    if (!houseReachable) {
      showToast('Je Sandhovius-box is nu niet bereikbaar. Probeer het opnieuw zodra hij weer reageert.', 'error')
      return
    }
    setNewDeviceIds((prev) => [...prev, device.id])
    setTimeout(() => setNewDeviceIds((prev) => prev.filter((id) => id !== device.id)), NEW_DEVICE_GRACE_MS)
    try {
      const command = await pb.collection('commands').create({ device: device.id, action: 'provision', status: 'pending' })
      watchCommand(command.id, device.name, device.id)
    } catch (err) {
      if (isSessionExpired(err)) return endExpiredSession()
      setNewDeviceIds((prev) => prev.filter((id) => id !== device.id))
      showToast(describeError(`${device.name} klaarzetten`, err), 'error')
    }
  }

  // Een scène uitvoeren: één commando, de box doet de rest (zie runScene in
  // de agent). De tegel zegt "Wordt uitgevoerd" tot de box klaar is, en
  // dan even "Klaar"; de apparaten zelf veranderen via de realtime stand.
  async function runScene(scene) {
    if (!houseReachable) {
      showToast('Je Sandhovius-box is nu niet bereikbaar. Probeer het opnieuw zodra hij weer reageert.', 'error')
      return
    }
    const setRun = (value) =>
      setSceneRunState((prev) => {
        const next = { ...prev }
        if (value) next[scene.id] = value
        else delete next[scene.id]
        return next
      })
    setRun('running')
    try {
      const command = await pb
        .collection('commands')
        .create({ scene: scene.id, action: 'run_scene', status: 'pending' }, { requestKey: null })
      watchCommand(command.id, `"${scene.name}"`, null, {
        failMessage: `"${scene.name}" is niet helemaal gelukt. Kijk bij Let op of al je apparaten bereikbaar zijn.`,
        onSettled: (status) => {
          if (status !== 'sent') return setRun(null)
          setRun('done')
          setTimeout(() => setRun(null), 2000)
        },
      })
    } catch (err) {
      if (isSessionExpired(err)) return endExpiredSession()
      setRun(null)
      showToast(describeError(`"${scene.name}" uitvoeren`, err), 'error')
    }
  }

  async function saveScene(sceneId, fields) {
    if (sceneId) {
      const updated = await pb.collection('scenes').update(sceneId, fields)
      setScenes((prev) => prev.map((s) => (s.id === sceneId ? updated : s)))
      return sceneId
    }
    const created = await pb.collection('scenes').create({ ...fields, house: house.id, order: scenesInHouse.length })
    setScenes((prev) => [...prev, created])
    return created.id
  }

  async function saveSchedule(sceneId, row) {
    const fields = { time: row.time, days: row.days, enabled: row.enabled }
    const record = row.id
      ? await pb.collection('schedules').update(row.id, fields)
      : await pb.collection('schedules').create({ ...fields, house: house.id, scene: sceneId })
    setSchedules((prev) => [...prev.filter((s) => s.id !== record.id), record])
    return record
  }

  async function deleteSchedule(scheduleId) {
    await pb.collection('schedules').delete(scheduleId)
    setSchedules((prev) => prev.filter((s) => s.id !== scheduleId))
  }

  function deleteScene(sceneId) {
    const scene = scenes.find((s) => s.id === sceneId)
    deleteLater(
      sceneId,
      `Scène "${scene?.name ?? ''}"`,
      () => pb.collection('scenes').delete(sceneId),
      () => setScenes((prev) => prev.filter((s) => s.id !== sceneId))
    )
  }

  const latest = useRef(null)
  latest.current = { toggleDevice, setDeviceTemperature, retrySetup }
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
      <main className={arriving ? 'login-page is-arriving' : 'login-page'}>
        <div className="login-layout">
          {/* Je huis 's avonds, met één lamp aan: puur beeld, dus verborgen
              voor schermlezers. */}
          <div className="login-house" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={i === 3 ? 'login-window login-window-lit' : 'login-window'} style={{ '--i': i }} />
            ))}
          </div>
          <div className="login-card">
            <h1 className="login-title">Sandhovius</h1>
            <p className="login-lede">{signupMode ? 'Maak een account aan.' : 'Log in om je huis te bedienen.'}</p>
            {/* Zichtbare labels i.p.v. alleen placeholders: een placeholder
                verdwijnt zodra je begint te typen. autoComplete laat de
                wachtwoordbeheerder van de telefoon het formulier invullen. */}
            {signupMode ? (
              <SignupForm
                pb={pb}
                initialEmail={email}
                onBack={(address) => {
                  setEmail(address)
                  setSignupMode(false)
                  setError('')
                }}
              />
            ) : resetMode ? (
              resetSent ? (
                <div className="form-stack">
                  <p className="login-note" role="status">
                    Als er een account bij {email} hoort, krijg je een e-mail met een link om een nieuw wachtwoord te
                    kiezen. Kijk ook even bij je ongewenste mail.
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setResetMode(false)
                      setResetSent(false)
                    }}
                  >
                    Terug naar inloggen
                  </button>
                </div>
              ) : (
                <form onSubmit={requestReset} className="form-stack">
                  <p className="login-note">Vul je e-mailadres in. Je krijgt een link om een nieuw wachtwoord te kiezen.</p>
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
                  {error && (
                    <p className="login-error" role="alert">
                      {error}
                    </p>
                  )}
                  <button type="submit" className="btn btn-primary" disabled={loggingIn}>
                    Stuur resetlink
                  </button>
                  <button
                    type="button"
                    className="btn btn-plain login-link"
                    onClick={() => {
                      setResetMode(false)
                      setError('')
                    }}
                  >
                    Terug naar inloggen
                  </button>
                </form>
              )
            ) : (
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
                  {arriving ? (
                    'Welkom thuis'
                  ) : loggingIn ? (
                    <>
                      <span className="spinner" aria-hidden="true" />
                      Bezig met inloggen…
                    </>
                  ) : (
                    'Inloggen'
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-plain login-link"
                  onClick={() => {
                    setResetMode(true)
                    setError('')
                  }}
                >
                  Wachtwoord vergeten?
                </button>
                <button
                  type="button"
                  className="btn btn-plain login-link"
                  onClick={() => {
                    setSignupMode(true)
                    setError('')
                  }}
                >
                  Account aanmaken
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    )
  }

  const roomNameById = Object.fromEntries(roomsInHouse.map((room) => [room.id, room.name]))
  const climateDevices = devicesInHouse.filter((device) => device.type === 'climate')
  // De thermostaat staat altijd op Home; de rest alleen als favoriet.
  // Op de volgorde die de bewoner koos; zonder keuze op naam.
  const favoriteDevices = devicesInHouse
    .filter((device) => device.favorite && device.type !== 'climate')
    .sort((a, b) => (a.favorite_order ?? 0) - (b.favorite_order ?? 0) || a.name.localeCompare(b.name, 'nl'))
  // Alleen als de box bereikbaar is: anders weten we niet zeker wat er aan
  // staat.
  const shelfDevices = houseReachable ? devicesInHouse.filter((device) => shelfIds.includes(device.id)) : []
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
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <li key={i} className="device-cell">
          <div className="panel card-skeleton" />
        </li>
      ))}
    </ul>
  )

  const noHouse = loaded && !house && (
    <p className="empty-state">
      Er is nog geen huis aan je account gekoppeld. Zodra je Sandhovius-box aan je account gekoppeld is, verschijnt
      je huis hier.
      <button type="button" className="btn btn-primary empty-state-action" onClick={() => setClaim({ initial: null })}>
        Box toevoegen
      </button>
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

  // Thermostaten in een eigen lijst: een paneel naast kleine tegels in één
  // raster maakt de rijen ongelijk hoog.
  function renderDevices(list) {
    const card = (device) => (
      <DeviceCard
        key={device.id}
        device={device}
        houseReachable={houseReachable}
        isNew={newDeviceIds.includes(device.id)}
        {...cardHandlers}
      />
    )
    const climate = list.filter((device) => device.type === 'climate')
    const others = list.filter((device) => device.type !== 'climate')
    return (
      <>
        {climate.length > 0 && <ul className="climate-list">{climate.map(card)}</ul>}
        {others.length > 0 && <ul className="device-list">{others.map(card)}</ul>}
      </>
    )
  }

  // Per kamer, heel rustig: een klein kamerwoord boven elke groep, in de
  // volgorde van de kamers (zonder kamer als laatste). De groepen lopen in
  // kolommen, zodat kleine kamers naast elkaar staan en Home laag blijft.
  function renderByRoom(list) {
    const groups = [...roomsInHouse.map((room) => ({ id: room.id, name: room.name })), { id: null, name: 'Geen kamer' }]
      .map((group) => ({
        ...group,
        devices: list.filter((device) =>
          group.id ? device.room === group.id : !roomsInHouse.some((room) => room.id === device.room)
        ),
      }))
      .filter((group) => group.devices.length > 0)
    return (
      <div className="room-groups">
        {groups.map((group) => (
          <div key={group.id ?? 'none'} className="room-group">
            <p className="room-group-name">{group.name}</p>
            {renderDevices(group.devices)}
          </div>
        ))}
      </div>
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
    header = <Header title="Scènes" />
    content = (
      <>
        {errorBanner}
        {noHouse}
        {skeleton}
        {loaded && house && (
          <ScenesView
            scenes={scenesInHouse}
            schedules={schedules}
            deviceNameById={Object.fromEntries(devicesInHouse.map((d) => [d.id, d.name]))}
            runState={sceneRunState}
            canRun={houseReachable}
            onRun={runScene}
            onEdit={(scene) => setEditingScene(scene.id)}
            onCreate={() => setEditingScene('new')}
          />
        )}
      </>
    )
  } else if (tab === 'instellingen') {
    header = <Header title="Opties" />
    content = (
      <>
        {errorBanner}
        <SettingsView
          house={house}
          houses={houses}
          onSelectHouse={selectHouse}
          roomCount={roomsInHouse.length}
          userEmail={userEmail}
          language={pb.authStore.record?.language || 'nl'}
          onChangeLanguage={changeLanguage}
          onOpenHouse={() => setHouseModalOpen(true)}
          onAddBox={() => setClaim({ initial: null })}
          onChangePassword={() => setChangingPassword(true)}
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
            <div className="dashboard-side">
              <HousePanel
                house={house}
                realtimeLink={realtimeLink}
                houseLink={houseLink}
                now={now}
                attention={loaded ? attention : []}
                onSwitchHouse={houses.length > 1 ? () => selectTab('instellingen') : undefined}
                onOpenDevice={(device) => setSettingsDeviceId(device.id)}
                // Alleen als de box bereikbaar is: anders weten we niet zeker
                // wat er aan staat, en zegt de verbindingsmelding genoeg.
                onAllOff={loaded && houseReachable && devicesOn.length > 0 ? turnAllOff : undefined}
              />
              {house.weather?.condition && (
                <WeatherCard weather={house.weather} updated={house.weather_updated} now={now} />
              )}
            </div>
          )}

          <div className="dashboard-devices">
            {skeleton}

            {firstDevice}

            {loaded && house && devicesInHouse.length > 0 && (
              <div className="home-grid">
                {scenesInHouse.length > 0 && (
                  <HomeScenes
                    scenes={scenesInHouse}
                    runState={sceneRunState}
                    canRun={houseReachable}
                    onRun={runScene}
                    onEdit={(scene) => setEditingScene(scene.id)}
                  />
                )}

                {/* Eén rij tegels, met een keuze: je vaste knoppen of alles wat
                    nu aan staat. */}
                <section className="home-section home-devices" aria-label="Apparaten">
                  <div className="section-head">
                    <fieldset className="segmented home-view">
                      <legend className="visually-hidden">Laat zien</legend>
                      {[
                        ['favorites', 'Favorieten'],
                        ['on', 'Staat aan'],
                      ].map(([value, label]) => (
                        <label
                          key={value}
                          className={`segmented-option ${homeView === value ? 'segmented-option-selected' : ''}`}
                        >
                          <input
                            type="radio"
                            name="home-view"
                            className="visually-hidden"
                            checked={homeView === value}
                            onChange={() => chooseHomeView(value)}
                          />
                          {label}
                        </label>
                      ))}
                    </fieldset>
                    {homeView === 'favorites' && favoriteDevices.length > 1 && (
                      <button type="button" className="btn btn-plain section-action" onClick={() => setOrderingFavorites(true)}>
                        Volgorde
                      </button>
                    )}
                  </div>
                  {homeView === 'favorites' ? (
                    favoriteDevices.length > 0 ? (
                      renderByRoom(favoriteDevices)
                    ) : (
                      <p className="section-hint">
                        Zet apparaten die je vaak gebruikt hier: houd een apparaat ingedrukt en zet "Op Home tonen" aan.
                      </p>
                    )
                  ) : !houseReachable ? (
                    <p className="section-hint">Je box reageert niet, dus we weten nu niet zeker wat er aan staat.</p>
                  ) : shelfDevices.length > 0 ? (
                    renderByRoom(shelfDevices)
                  ) : (
                    <p className="section-hint">Alle lampen en stopcontacten zijn uit.</p>
                  )}
                </section>

                {climateDevices.length > 0 && (
                  <section className="home-section home-climate" aria-label="Temperatuur">
                    {renderDevices(climateDevices)}
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <PullToRefresh onRefresh={fetchAll} />

      <div className="tab-view">
        <div ref={tabViewRef}>
          {header}

          <main className="container">{content}</main>
        </div>
      </div>

      <BottomNav activeTab={tab} onSelect={selectTab} onAdd={house ? () => setAddDeviceOpen(true) : null} />

      {houseModalOpen && (
        <HouseModal
          house={house}
          rooms={roomsInHouse}
          onRenameHouse={renameHouse}
          onAddRoom={addRoom}
          onRenameRoom={renameRoom}
          onMoveRoom={moveRoom}
          onDeleteRoom={deleteRoom}
          onReleaseBox={releaseBox}
          onClose={() => setHouseModalOpen(false)}
        />
      )}

      {claim && (
        <ClaimSheet
          pb={pb}
          user={pb.authStore.record}
          houses={houses}
          initial={claim.initial}
          onClaimed={boxClaimed}
          onClose={() => setClaim(null)}
        />
      )}

      {editingScene && (
        <SceneModal
          key={editingScene}
          scene={editingScene === 'new' ? null : scenesInHouse.find((s) => s.id === editingScene)}
          schedules={schedules.filter((s) => s.scene === editingScene)}
          devices={devicesInHouse.filter((d) => d.type !== 'sensor')}
          roomNameById={roomNameById}
          onSaveScene={saveScene}
          onSaveSchedule={saveSchedule}
          onDeleteSchedule={deleteSchedule}
          onDelete={deleteScene}
          onClose={() => setEditingScene(null)}
        />
      )}

      {changingPassword && (
        <ChangePasswordModal onChange={changePassword} onClose={() => setChangingPassword(false)} />
      )}

      {orderingFavorites && (
        <FavoritesOrderModal
          favorites={favoriteDevices}
          onMove={moveFavorite}
          onClose={() => setOrderingFavorites(false)}
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
          // Alleen als het klaarzetten mislukt is (niet: nog bezig).
          onRetrySetup={
            houseReachable && !settingsDevice.entity_id && !newDeviceIds.includes(settingsDevice.id)
              ? retrySetup
              : undefined
          }
          onClose={() => setSettingsDeviceId(null)}
        />
      )}
    </>
  )
}
