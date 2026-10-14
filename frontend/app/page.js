'use client'

import { defaultPocketbaseUrl } from '../lib/pocketbase'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import PocketBase, { LocalAuthStore } from 'pocketbase'
import Header from '../components/Header'
import DeviceCard, { TOGGLEABLE_TYPES, isDeviceOn } from '../components/DeviceCard'
import DeviceSettingsModal from '../components/DeviceSettingsModal'
import HomeNotices from '../components/HomeNotices'
import HomeCategories from '../components/HomeCategories'
import ConnectionStatus from '../components/ConnectionStatus'
import { WeatherCard } from '../components/Weather'
import HomeScenes from '../components/HomeScenes'
import PullToRefresh from '../components/PullToRefresh'
import HouseModal from '../components/HouseModal'
import PairingSheet from '../components/PairingSheet'
import ToastContainer from '../components/ToastContainer'
import BottomNav, { TABS } from '../components/BottomNav'
import RoomTabs from '../components/RoomTabs'
import RoomsPanel, { RoomSwitch, describeRoom } from '../components/RoomsPanel'
import SettingsView from '../components/SettingsView'
import FavoritesOrderModal from '../components/FavoritesOrderModal'
import { favoriteDevices as favoriteDevicesOf, favoriteFor, nextOrder } from '../lib/favorites'
import HouseholdSection from '../components/HouseholdSection'
import InvitationCard from '../components/InvitationCard'
import { isAdmin, isHouseDataRefusal, lostHouses, pickHouse } from '../lib/household'
import ChangePasswordModal from '../components/ChangePasswordModal'
import SignupForm from '../components/SignupForm'
import ClaimSheet from '../components/ClaimSheet'
import { pendingKey } from '../lib/claim'
import { LAST_REFRESH_KEY, needsRefresh } from '../lib/session'
import { describeError, isSessionExpired } from '../lib/errors'
import { requestErrorKey } from '../lib/account'
import { formatTemperature } from '../lib/temperature'
import { cachedFormat } from '../lib/language'
import { useTranslations } from 'use-intl'
import { useIntl, useLanguage } from './LanguageContext'
import { houseConnection } from '../lib/connection'
import { useNow } from '../lib/useNow'
import { createLatestWatchers } from '../lib/light'
import { applyStateEcho, createInflight, settleDevice } from '../lib/inflight'
import { uid } from '../lib/uid'
import { greeting, homeLede, houseSummary, indoorTemperature, sortAttention } from '../lib/home'
import { isWeatherStale } from '../lib/weather'
import { isBatteryLow } from '../lib/battery'
import { scheduleName } from '../lib/schedules'
import { categorySummary, countsInSummary } from '../lib/categories'
import { presetTemps } from '../lib/climate'
import { displayType } from '../lib/devices'
import { alarmKind } from '../lib/sensors'
import { LightbulbIcon, PlusIcon, PowerIcon, deviceTypeIcon } from '../lib/icons'
import ScenesView from '../components/ScenesView'
import SceneModal from '../components/SceneModal'
import MotionLightSheet from '../components/MotionLightSheet'
import RoutineSheet from '../components/RoutineSheet'
import AddRoomSheet from '../components/AddRoomSheet'
import PresenceBar from '../components/PresenceBar'
import NotificationsSection from '../components/NotificationsSection'
import { byRoom, motionSensors, switchableDevices } from '../lib/motionLights'
import { routineSensors, routineTitle } from '../lib/routines'
import { memberName } from '../lib/presence'
import { guestEnds } from '../lib/household'

// "Zondag 27 september", "Sunday 27 September"
function formatToday(ms, locale) {
  const text = cachedFormat(Intl.DateTimeFormat, locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(ms)
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
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
// Zonder vaste URL: PocketBase op dezelfde host als de pagina, zodat de
// telefoon op het LAN (http://192.168.x.x:3000) de box vindt i.p.v. zichzelf.
// Zo lang weg uit de app (achtergrond, ander tabblad) en we halen alles
// opnieuw op bij terugkomst.
const AWAY_REFETCH_MS = 30 * 1000

const pb = new PocketBase(defaultPocketbaseUrl(), new LocalAuthStore('pocketbase_auth'))
const SELECTED_ROOM_KEY = 'sandhovius-selected-room'
// Wat Home laat zien: je favorieten of alles wat aan staat.
const SELECTED_HOUSE_KEY = 'sandhovius-selected-house'
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
const ARRIVE_MS = 2100
const ARRIVE_REDUCED_MS = 300
// Zo lang heeft Home de klasse .arriving (de binnenkomst in base.css).
const ARRIVE_IN_MS = 600

export default function Home() {
  const t = useTranslations()
  const { language, setLanguage, adoptAccountLanguage } = useLanguage()
  const intl = useIntl()
  const { locale } = intl
  // null = nog niet bekeken (de server-render en de eerste client-render):
  // dan alleen de achtergrond. Met false begon elke start met het
  // inlogscherm en zijn binnenkomst, ook als je al ingelogd was.
  const [loggedIn, setLoggedIn] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [arriving, setArriving] = useState(false)

  const [houses, setHouses] = useState([])
  const [rooms, setRooms] = useState([])
  const [devices, setDevices] = useState([])
  // Eigen favorieten (records { user, device, order }); per persoon.
  const [favorites, setFavorites] = useState([])
  // Uitnodigingen die je mag zien: voor jou, en (als beheerder) die van je
  // huizen. Zie myInvitations en houseInvitations.
  const [invitations, setInvitations] = useState([])
  const [scenes, setScenes] = useState([])
  const [schedules, setSchedules] = useState([])
  const [motionLights, setMotionLights] = useState([])
  const [routines, setRoutines] = useState([])
  // Thuis of weg: de rijen van alle huizen, en de leden (met namen) van het
  // gekozen huis.
  const [presence, setPresence] = useState([])
  const [houseMembers, setHouseMembers] = useState([])
  // Meldingen: je eigen aanmeldingen (per apparaat) en Meld dit-regels.
  const [pushSubscriptions, setPushSubscriptions] = useState([])
  const [notifyRules, setNotifyRules] = useState([])
  // Scène die nu loopt of net klaar is: { [sceneId]: 'running' | 'done' }.
  const [sceneRunState, setSceneRunState] = useState({})
  // Open scène-sheet: 'new', een scène-ID, of null.
  const [editingScene, setEditingScene] = useState(null)
  // null, 'new' of het id van het bewegingslicht in de sheet.
  const [editingMotion, setEditingMotion] = useState(null)
  const [editingRoutine, setEditingRoutine] = useState(null)
  const [addingRoom, setAddingRoom] = useState(false)
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
  // Verwijderd, maar nog even terug te halen ("Ongedaan maken"): apparaten
  // en kamers die al uit beeld zijn, en pas na UNDO_MS echt weg gaan.
  const [hiddenIds, setHiddenIds] = useState([])
  const deleteTimers = useRef({})
  const lightWatchers = useRef(createLatestWatchers())
  // Commando's onderweg per apparaat (lib/inflight).
  const inflight = useRef(createInflight())

  useEffect(() => {
    setLoggedIn(pb.authStore.isValid)
  }, [])

  // De taal van het account geldt, ook op een nieuwe telefoon; en ook als
  // het record later bijgewerkt wordt (verlengen, Opties → Taal).
  useEffect(() => {
    if (!loggedIn) return
    adoptAccountLanguage(pb.authStore.record?.language)
    return pb.authStore.onChange((token, record) => adoptAccountLanguage(record?.language))
    // adoptAccountLanguage is per render nieuw, maar doet hetzelfde.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn])

  // Ingelogd blijven tot je zelf uitlogt: het inlogtoken verlengen bij het
  // openen en bij terugkeer naar de app, hooguit eens per dag (zie
  // lib/session.js). Alleen een 401 betekent uitloggen; zonder verbinding
  // blijf je ingelogd en proberen we het de volgende keer opnieuw.
  useEffect(() => {
    if (!loggedIn) return
    async function refreshSession() {
      let last = null
      try {
        last = Number(window.localStorage.getItem(LAST_REFRESH_KEY)) || null
      } catch {}
      if (!needsRefresh(pb.authStore.token, last)) return
      try {
        await pb.collection('users').authRefresh({ requestKey: 'session-refresh' })
        try {
          window.localStorage.setItem(LAST_REFRESH_KEY, String(Date.now()))
        } catch {}
      } catch (err) {
        if (isSessionExpired(err)) endExpiredSession()
        else console.error('[sessie verlengen]', err)
      }
    }
    refreshSession()
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshSession()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
    // Alleen bij in- of uitloggen opnieuw; endExpiredSession is stabiel genoeg.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn])

  useEffect(() => {
    // Alleen als er nog niets geladen is.
    if (loggedIn && !loaded) {
      fetchAll()
    }
    // Alleen bij inloggen ophalen, niet bij elke wijziging van loaded/fetchAll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              ? // De echte stand is er; loopt er nog een commando, dan pas
                // tonen als dat klaar is (anders even een oudere stand).
                applyStateEcho(d, e.record, inflight.current.count(d.id))
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
            d.id === e.record.id ? { ...e.record, expand: d.expand, _pending: d._pending, _echo: d._echo } : d
          )
        })
      }),
      pb.collection('invitations').subscribe('*', (e) => {
        setInvitations((prev) =>
          e.action === 'delete'
            ? prev.filter((i) => i.id !== e.record.id)
            : [e.record, ...prev.filter((i) => i.id !== e.record.id)]
        )
      }),
      pb.collection('favorites').subscribe('*', (e) => {
        setFavorites((prev) =>
          e.action === 'delete'
            ? prev.filter((f) => f.id !== e.record.id)
            : [...prev.filter((f) => f.id !== e.record.id), e.record]
        )
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
      // Ook hier schrijft de box last_run/last_error.
      pb.collection('motion_lights').subscribe('*', (e) => {
        setMotionLights((prev) =>
          e.action === 'delete'
            ? prev.filter((m) => m.id !== e.record.id)
            : [...prev.filter((m) => m.id !== e.record.id), e.record]
        )
      }),
      // Thuis of weg van huisgenoten, live.
      pb.collection('presence').subscribe('*', (e) => {
        setPresence((prev) =>
          e.action === 'delete'
            ? prev.filter((p) => p.id !== e.record.id)
            : [...prev.filter((p) => p.id !== e.record.id), e.record]
        )
      }),
      // En bij routines: last_run, last_error en next_run.
      pb.collection('automations').subscribe('*', (e) => {
        setRoutines((prev) =>
          e.action === 'delete'
            ? prev.filter((r) => r.id !== e.record.id)
            : [...prev.filter((r) => r.id !== e.record.id), e.record]
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
      window.scrollTo(0, 0)
      document.documentElement.classList.add('arriving')
      setTimeout(() => document.documentElement.classList.remove('arriving'), ARRIVE_IN_MS)
      setTab('home')
      setLoggedIn(true)
      setLoggingIn(false)
      setArriving(false)
    } catch (err) {
      // 400 is bij inloggen vrijwel altijd een onjuiste combinatie — dat
      // verdient een specifiekere melding dan "controleer de gegevens".
      console.error('[inloggen]', err)
      setError(err?.status === 400 ? t('login.wrongCombination') : t(requestErrorKey(err)))
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
      console.error('[resetlink versturen]', err)
      setError(t(requestErrorKey(err)))
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
    // De sheet zegt zelf dat het gelukt is (en wat dat voor andere
    // apparaten betekent); geen toast erbij.
    await pb.collection('users').authWithPassword(record.email, newPassword)
  }

  async function changeLanguage(language) {
    await pb.collection('users').update(pb.authStore.record.id, { language })
  }

  // Na het koppelen: huizen opnieuw ophalen en het nieuwe huis tonen.
  async function boxClaimed(houseId) {
    await fetchAll()
    selectHouse(houseId)
  }

  // Huisgenoten. Lidmaatschap wijzigt alleen via de endpoints in
  // household.pb.js; het huis zelf komt daarna via realtime binnen.
  async function acceptInvitation(invitation) {
    const res = await pb.send(`/api/sandhovius/invitations/${invitation.id}/accept`, { method: 'POST' })
    setInvitations((prev) => prev.filter((i) => i.id !== invitation.id))
    await fetchAll()
    selectHouse(res.house)
    selectTab('home')
  }

  async function deleteInvitation(invitation) {
    await pb.collection('invitations').delete(invitation.id)
    setInvitations((prev) => prev.filter((i) => i.id !== invitation.id))
  }

  // until: "JJJJ-MM-DD" voor een gast (D2), anders leeg.
  async function inviteMember(email, role, until = '') {
    const created = await pb.collection('invitations').create({
      house: house.id,
      email,
      role,
      invited_by: userId,
      ...(until ? { until, ends: guestEnds(until) } : {}),
    })
    setInvitations((prev) => [created, ...prev.filter((i) => i.id !== created.id)])
    showToast(t('toast.invitationSent', { email: created.email }))
  }

  async function changeMemberRole(memberId, role) {
    await pb.send(`/api/sandhovius/houses/${house.id}/members/${memberId}`, { method: 'PATCH', body: { role } })
  }

  async function setMemberCanEdit(memberId, canEditValue) {
    await pb.send(`/api/sandhovius/houses/${house.id}/members/${memberId}`, {
      method: 'PATCH',
      body: { can_edit: canEditValue },
    })
  }

  // Jezelf verwijderen is het huis verlaten: daarna alles opnieuw ophalen
  // (het huis is weg) en naar Home, met het volgende huis of het lege scherm.
  async function removeMember(memberId) {
    await pb.send(`/api/sandhovius/houses/${house.id}/members/${memberId}`, { method: 'DELETE' })
    if (memberId !== userId) return
    leftHouseIds.current.push(house.id)
    await fetchAll()
    selectTab('home')
  }

  // Box loskoppelen: het huis en alles erin blijft.
  async function releaseBox(houseId) {
    await pb.send('/api/sandhovius/release', { method: 'POST', body: { house: houseId } })
    await fetchAll()
    showToast(t('toast.boxReleased'))
  }

  function logout() {
    pb.authStore.clear()
    try {
      window.localStorage.removeItem(LAST_REFRESH_KEY)
    } catch {}
    // Een koppelcode uit een QR-link hoort niet bij de volgende die inlogt.
    try {
      window.sessionStorage.removeItem(pendingKey)
    } catch {}
    setClaim(null)
    setLoggedIn(false)
    setHouses([])
    setRooms([])
    setDevices([])
    setFavorites([])
    setInvitations([])
    setScenes([])
    setSchedules([])
    setMotionLights([])
    setRoutines([])
    setPresence([])
    setHouseMembers([])
    setPushSubscriptions([])
    setNotifyRules([])
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
    setError(t('toast.sessionExpired'))
  }

  // houses/rooms/devices.listRule filteren al op de ingelogde user, dus we
  // vragen alles rechtstreeks op. Er is voorlopig maar één huis per user —
  // zodra dat verandert is er hier een echte huis-keuze nodig, nu is het
  // gewoon "het eerste (en enige) huis".
  async function fetchAll() {
    setError('')
    try {
      const [
        houseRecords,
        roomRecords,
        deviceRecords,
        sceneRecords,
        scheduleRecords,
        favoriteRecords,
        invitationRecords,
        motionRecords,
        routineRecords,
        presenceRecords,
        subscriptionRecords,
        notifyRuleRecords,
      ] = await Promise.all([
        pb.collection('houses').getFullList(),
        pb.collection('rooms').getFullList({ sort: 'order' }),
        pb.collection('devices').getFullList({ expand: 'device_state_via_device' }),
        pb.collection('scenes').getFullList({ sort: 'order,name' }),
        pb.collection('schedules').getFullList({ sort: 'time' }),
        pb.collection('favorites').getFullList(),
        pb.collection('invitations').getFullList({ sort: '-created' }),
        pb.collection('motion_lights').getFullList(),
        pb.collection('automations').getFullList(),
        pb.collection('presence').getFullList(),
        pb.collection('push_subscriptions').getFullList(),
        pb.collection('notification_rules').getFullList(),
      ])
      // Een huis dat er niet meer is en dat je niet zelf verliet: een ander
      // heeft je eruit gehaald. Rustig zeggen, en verder met het volgende huis.
      const lost = lostHouses(housesRef.current, houseRecords, leftHouseIds.current)
      leftHouseIds.current = []
      if (lost.length > 0) {
        const names = cachedFormat(Intl.ListFormat, locale, { type: 'conjunction' }).format(lost.map((h) => h.name))
        showToast(t('toast.lostAccess', { names }))
      }
      setHouses(houseRecords)
      setRooms(roomRecords)
      setDevices(deviceRecords)
      setScenes(sceneRecords)
      setSchedules(scheduleRecords)
      setMotionLights(motionRecords)
      setRoutines(routineRecords)
      setPresence(presenceRecords)
      setPushSubscriptions(subscriptionRecords)
      setNotifyRules(notifyRuleRecords)
      setFavorites(favoriteRecords)
      setInvitations(invitationRecords)
      setLoaded(true)
    } catch (err) {
      if (isSessionExpired(err)) {
        endExpiredSession()
        return
      }
      setError(describeError(t, t('errors.what.fetchDevices'), err))
      setFetchFailed(true)
    }
  }
  // Voor de realtime-effect, die bij herverbinden de nieuwste versie nodig
  // heeft zonder zelf opnieuw te abonneren.
  const fetchAllRef = useRef(fetchAll)
  fetchAllRef.current = fetchAll
  // Voor fetchAll: welke huizen er waren, en welke je zelf net verliet.
  const housesRef = useRef(houses)
  housesRef.current = houses
  const leftHouseIds = useRef([])

  // Uit een huis gehaald worden komt niet via realtime binnen (PocketBase
  // stuurt niets naar wie de regel niet meer haalt). Daarom opnieuw ophalen:
  // - als de server iets op huisdata weigert (pb.afterSend ziet elk antwoord,
  //   ook fouten), samengevoegd tot één keer;
  // - als je na minstens AWAY_REFETCH_MS terugkomt in de app (ook een huis
  //   dat je op een ander toestel accepteerde verschijnt dan).
  useEffect(() => {
    if (!loggedIn) return
    let timer = null
    pb.afterSend = (response, data) => {
      if (!timer && isHouseDataRefusal(response.url, response.status)) {
        timer = setTimeout(() => {
          timer = null
          fetchAllRef.current()
        }, 300)
      }
      return data
    }
    let hiddenAt = null
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
      } else if (hiddenAt !== null && Date.now() - hiddenAt >= AWAY_REFETCH_MS) {
        hiddenAt = null
        fetchAllRef.current()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearTimeout(timer)
      pb.afterSend = undefined
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [loggedIn])

  function retryFetch() {
    setFetchFailed(false)
    fetchAll()
  }

  const house = pickHouse(houses, selectedHouseId)
  const userId = pb.authStore.record?.id
  const houseAdmin = isAdmin(house, userId)
  // E-mailadressen van uitnodigingen staan in kleine letters.
  const myEmail = (pb.authStore.record?.email || '').toLowerCase()
  const myInvitations = invitations.filter((i) => i.email === myEmail)
  const houseInvitations = house ? invitations.filter((i) => i.house === house.id && i.email !== myEmail) : []
  const presenceInHouse = presence.filter((p) => p.house === house?.id)
  // F2: de standen van de verwarming; één object zolang ze niet veranderen,
  // zodat de gememoiseerde kaarten niet her-renderen.
  const climatePresets = useMemo(
    () => presetTemps(house),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [house?.climate_comfort, house?.climate_eco, house?.climate_sleep]
  )
  // D1: mag ik automatiseringen en apparaten wijzigen? Een beheerder altijd;
  // een lid tenzij hij op "alleen bedienen" staat. PocketBase dwingt het af,
  // de app laat de knoppen weg.
  const canEdit = houseAdmin || !(house?.operate_only ?? []).includes(userId)

  // De leden met hun namen, voor thuis/weg en routines. Opnieuw zodra de
  // leden van het huis veranderen (realtime op houses).
  const membership = house ? `${house.id}:${(house.members ?? []).join(',')}:${(house.operate_only ?? []).join(',')}` : ''
  useEffect(() => {
    if (!membership) return
    let cancelled = false
    const houseId = membership.split(':')[0]
    // requestKey: null — de Huisgenoten-sectie haalt dezelfde lijst; anders
    // annuleert de SDK er één.
    pb.send(`/api/sandhovius/houses/${houseId}/members`, { method: 'GET', requestKey: null })
      .then((res) => {
        if (!cancelled) setHouseMembers(res.items ?? [])
      })
      .catch((err) => console.error('[presence] leden ophalen:', err))
    return () => {
      cancelled = true
    }
  }, [membership])

  // Meldingen op dit apparaat (Opties → Meldingen).
  async function createPushSubscription(fields) {
    const record = await pb.collection('push_subscriptions').create(fields)
    setPushSubscriptions((prev) => [...prev.filter((s) => s.id !== record.id), record])
  }

  async function deletePushSubscription(id) {
    await pb.collection('push_subscriptions').delete(id)
    setPushSubscriptions((prev) => prev.filter((s) => s.id !== id))
  }

  // Meld dit: een eigen regel per sensor en gebeurtenis.
  async function saveNotifyRule(id, fields) {
    const record = id
      ? await pb.collection('notification_rules').update(id, fields)
      : await pb.collection('notification_rules').create({ ...fields, house: house.id, user: userId })
    setNotifyRules((prev) => [...prev.filter((r) => r.id !== record.id), record])
  }

  // Je eigen stand: meteen om, en terug als opslaan mislukt.
  async function setMyPresence(home) {
    const mine = presenceInHouse.find((p) => p.user === userId)
    const temp = { id: mine?.id ?? 'pending', house: house.id, user: userId, home }
    setPresence((prev) => [...prev.filter((p) => p !== mine), temp])
    try {
      const record = mine
        ? await pb.collection('presence').update(mine.id, { home }, { requestKey: null })
        : await pb.collection('presence').create({ house: house.id, user: userId, home }, { requestKey: null })
      setPresence((prev) => [...prev.filter((p) => p !== temp && p.id !== record.id), record])
    } catch (err) {
      if (isSessionExpired(err)) return endExpiredSession()
      setPresence((prev) => [...prev.filter((p) => p !== temp), ...(mine ? [mine] : [])])
      showToast(describeError(t, t('errors.what.presence'), err), 'error')
    }
  }

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
  const motionLightsInHouse = motionLights.filter((m) => m.house === house?.id)
  const routinesInHouse = routines.filter((r) => r.house === house?.id)
  const routineNames = {
    devices: Object.fromEntries(devicesInHouse.map((d) => [d.id, d.name])),
    scenes: Object.fromEntries(scenesInHouse.map((s) => [s.id, s.name])),
    users: Object.fromEntries(houseMembers.map((m) => [m.id, memberName(m)])),
  }
  // De sensoren die beweging melden, plus de sensor van het bewegingslicht
  // dat je wijzigt (ook als hij nog niets meldde).
  function sensorsForMotion(editing) {
    const list = byRoom(motionSensors(devicesInHouse), roomsInHouse)
    const current = motionLightsInHouse.find((m) => m.id === editing)?.sensor
    const extra = devicesInHouse.find((d) => d.id === current && !list.some((s) => s.id === d.id))
    return extra ? [...list, extra] : list
  }
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
  // Het tabblad-element van de vorige keer: is het nieuw (net ingelogd, je
  // komt van Opties binnen op Home), dan is dit geen tabwissel maar
  // binnenkomen, en dat heeft zijn eigen animatie (.arriving in base.css).
  const shownViewRef = useRef(null)
  useLayoutEffect(() => {
    const previous = previousTabRef.current
    previousTabRef.current = tab
    const view = tabViewRef.current
    const fresh = view !== shownViewRef.current
    shownViewRef.current = view
    if (previous === tab || !view) return
    window.scrollTo(0, 0)
    if (fresh || document.documentElement.classList.contains('arriving')) return
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
    // loggedIn: ook bij in- en uitloggen zonder tabwissel het element bijwerken.
  }, [tab, loggedIn])

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
    const id = uid()
    const duration = type === 'error' || action ? UNDO_MS : 3500
    setToasts((prev) => [...prev, { id, message, type, duration, action }])
    setTimeout(() => dismissToast(id), duration)
  }

  function dismissToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  const settingsDevice = devices.find((d) => d.id === settingsDeviceId) ?? null

  // Per kamer ook wat de kamerschakelaar bedient: de lampen en
  // stopcontacten die de box kan schakelen (online en klaargezet), en welke
  // daarvan aan staan.
  const roomTabs = [
    ...roomsInHouse.map((room) => ({
      id: room.id,
      label: room.name,
      devices: devicesInHouse.filter((device) => device.room === room.id),
    })),
    ...(unassignedDevices.length > 0 ? [{ id: '__unassigned', label: t('rooms.unassigned'), devices: unassignedDevices }] : []),
  ].map((room) => {
    const switchable = room.devices.filter(
      (device) => TOGGLEABLE_TYPES.includes(device.type) && device.online && device.entity_id
    )
    const on = switchable.filter((device) => isDeviceOn(device.type, device.expand?.device_state_via_device?.[0]?.state))
    return { ...room, switchable, on }
  })
  const selectedRoom = roomTabs.find((room) => room.id === selectedRoomId)

  // Welke lampen/stopcontacten staan er aan? Voor "Alles uit" en de rij
  // "Staat aan" op Home. Een apparaat dat offline is telt niet mee: van
  // "aan" weten we dan niets zeker.
  const devicesOn = devicesInHouse.filter(
    (device) =>
      TOGGLEABLE_TYPES.includes(device.type) &&
      device.online &&
      isDeviceOn(device.type, device.expand?.device_state_via_device?.[0]?.state)
  )

  // A3: de snelkoppeling "Alles uit" op het app-icoon (manifest shortcuts)
  // opent /?do=all-off. Eén keer uitvoeren zodra het huis er is, en de
  // parameter meteen weghalen: herladen zet niet nog eens alles uit.
  const shortcutDone = useRef(false)
  useEffect(() => {
    if (shortcutDone.current || !loaded || !house) return
    if (new URLSearchParams(window.location.search).get('do') !== 'all-off') return
    shortcutDone.current = true
    window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    if (!houseReachable) {
      showToast(t('toast.boxUnreachable'), 'error')
      return
    }
    if (devicesOn.length === 0) {
      showToast(t('toast.nothingOn'))
      return
    }
    turnAllOff()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, house?.id, houseReachable])
  // "Let op" bovenaan Home (HomeNotices): wat de bewoner zelf moet
  // oplossen, op één plek i.p.v. verspreid over tegels in verschillende
  // kamers. Alleen als de box bereikbaar is: anders is álles onbekend en zegt de
  // verbindingsmelding genoeg. Net toegevoegde apparaten tellen nog niet.
  const attention = houseReachable
    ? sortAttention(
        devicesInHouse.flatMap((device) => {
          const state = device.expand?.device_state_via_device?.[0]?.state
          // Rook of lekkage gaat boven alles, ook boven offline: de laatste
          // melding van een sensor die daarna wegviel is nog steeds een alarm.
          const alarm = alarmKind(device, state)
          if (alarm) return [{ device, kind: alarm }]
          if (!device.online) return [{ device, kind: 'offline' }]
          const battery = state?.battery
          if (isBatteryLow(battery)) return [{ device, kind: 'battery', battery }]
          return []
        })
      )
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
      showToast(t('toast.boxUnreachable'), 'error')
      return
    }
    if (!device.online) {
      showToast(t('toast.deviceOffline', { name: device.name }), 'error')
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
    const done = inflight.current.begin(device.id)
    try {
      const command = await pb.collection('commands').create({
        device: device.id,
        action: 'toggle',
        status: 'pending',
      })
      watchCommand(command.id, device.name, device.id, { done })
      // De verwarming uitzetten is het ene schakelen met echte gevolgen
      // (een koud huis): even terug te draaien.
      if (device.type === 'climate' && !willBeOn) {
        showToast(t('toast.heatingOff'), 'info', {
          label: t('toast.undo'),
          onClick: () => setSwitches([device], true),
        })
      }
    } catch (err) {
      done()
      if (isSessionExpired(err)) return endExpiredSession()
      showToast(describeError(t, t(willBeOn ? 'errors.what.switchOn' : 'errors.what.switchOff', { name: device.name }), err), 'error')
      fetchAll()
    }
  }

  // Een schuif of staal van de lamp-bediening: turn_on met alleen de
  // gezette sleutels (helderheid, wit of kleur). Op een lamp die uit staat
  // zet dat hem aan met die waarde. Zelfde optimistische voornemen als een
  // tik; geen melding bij succes, de lamp zelf is de bevestiging. De
  // sheet stuurt hooguit één per 400 ms (lib/light throttle), dus elk
  // commando krijgt zijn eigen requestKey: de SDK annuleert er anders één.
  // Laat knipperen (detail-sheet): welke lamp is dit? Eén commando; de lamp
  // zelf is de bevestiging, alleen mislukken geeft een melding.
  async function identifyDevice(device) {
    if (!houseReachable) {
      showToast(t('toast.boxUnreachable'), 'error')
      return
    }
    try {
      const command = await pb.collection('commands').create({ device: device.id, action: 'identify', status: 'pending' })
      watchCommand(command.id, device.name, null)
    } catch (err) {
      if (isSessionExpired(err)) return endExpiredSession()
      showToast(describeError(t, t('errors.what.identify', { name: device.name }), err), 'error')
    }
  }

  async function setLight(device, payload) {
    if (!houseReachable) {
      showToast(t('toast.boxUnreachable'), 'error')
      return
    }
    if (!device.online) {
      showToast(t('toast.deviceOffline', { name: device.name }), 'error')
      return
    }
    // De stand die dit commando oplevert, voor een vlotte tegel.
    const attrs = {}
    if (payload.brightness_pct !== undefined) attrs.brightness = Math.round((payload.brightness_pct / 100) * 255)
    if (payload.color_temp_kelvin !== undefined) {
      attrs.color_mode = 'color_temp'
      attrs.color_temp_kelvin = payload.color_temp_kelvin
    }
    if (payload.rgb_color !== undefined) {
      attrs.color_mode = 'rgb'
      attrs.rgb_color = payload.rgb_color
    }
    setDevices((prev) =>
      prev.map((d) => {
        if (d.id !== device.id) return d
        const stateRecord = d.expand?.device_state_via_device?.[0]
        const optimisticState = {
          ...stateRecord,
          state: {
            ...stateRecord?.state,
            state: 'on',
            attributes: { ...stateRecord?.state?.attributes, ...attrs },
          },
        }
        return { ...d, _pending: true, expand: { ...d.expand, device_state_via_device: [optimisticState] } }
      })
    )
    // Eén wachter per lamp: alleen het nieuwste commando mag nog melden.
    const token = lightWatchers.current.begin(device.id)
    const done = inflight.current.begin(device.id)
    try {
      const command = await pb
        .collection('commands')
        .create({ device: device.id, action: 'turn_on', payload, status: 'pending' }, { requestKey: null })
      const stop = watchCommand(command.id, device.name, device.id, {
        failMessage: t('toast.couldNotAdjust', { name: device.name }),
        done,
      })
      lightWatchers.current.register(device.id, token, stop)
    } catch (err) {
      done()
      if (isSessionExpired(err)) return endExpiredSession()
      showToast(describeError(t, t('errors.what.adjust', { name: device.name }), err), 'error')
      fetchAll()
    }
  }

  // Meerdere apparaten tegelijk aan of uit: "Alles uit", en het
  // terugdraaien daarvan of van "verwarming uit". Expliciet turn_on /
  // turn_off i.p.v. toggle, zodat twee keer "uit" gewoon uit blijft. Zelfde
  // voornemen-tot-bevestiging als een tik (_pending).
  async function setSwitches(list, on) {
    if (!houseReachable) {
      showToast(t('toast.boxUnreachable'), 'error')
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
        const done = inflight.current.begin(device.id)
        try {
          // requestKey: null — anders annuleert de SDK gelijktijdige
          // verzoeken naar hetzelfde adres, en gaat maar één lamp uit.
          const command = await pb.collection('commands').create(
            { device: device.id, action: on ? 'turn_on' : 'turn_off', status: 'pending' },
            { requestKey: null }
          )
          watchCommand(command.id, device.name, device.id, { done })
        } catch (err) {
          done()
          if (isSessionExpired(err)) return endExpiredSession()
          showToast(describeError(t, t(on ? 'errors.what.switchOn' : 'errors.what.switchOff', { name: device.name }), err), 'error')
          fetchAll()
        }
      })
    )
    return true
  }

  // "Alles uit" bovenaan Home: elke lamp en elk stopcontact dat aan
  // staat. Hier wél een melding, want je ziet niet alle tegels tegelijk, en
  // met "Ongedaan maken" gaat precies hetzelfde rijtje weer aan.
  // "Licht uit" in de Licht-sheet: alleen de lampen, met ongedaan maken.
  async function turnLightsOff(list) {
    if (list.length === 0 || !(await setSwitches(list, false))) return
    showToast(t('toast.allOff', { count: list.length, name: list[0].name }), 'info', {
      label: t('toast.undo'),
      onClick: () => setSwitches(list, true),
    })
  }

  async function turnAllOff() {
    const list = devicesOn
    if (list.length === 0 || !(await setSwitches(list, false))) return
    showToast(t('toast.allOff', { count: list.length, name: list[0].name }), 'info', {
      label: t('toast.undo'),
      onClick: () => setSwitches(list, true),
    })
  }

  // De kamerschakelaar: staat er iets aan, dan gaat dat uit; anders gaat
  // alles aan. Met "Ongedaan maken", zoals Alles uit: in de kamerlijst zie
  // je de tegels van die kamer niet.
  async function switchRoom(room) {
    const turnOn = room.on.length === 0
    const list = turnOn ? room.switchable : room.on
    if (list.length === 0 || !(await setSwitches(list, turnOn))) return
    showToast(
      t(turnOn ? 'toast.roomOn' : 'toast.roomOff', { count: list.length, name: list[0].name, room: room.label }),
      'info',
      { label: t('toast.undo'), onClick: () => setSwitches(list, !turnOn) }
    )
  }

  // Zelfde optimistisch patroon als toggleDevice, maar voor climate-
  // entities: het doel zit genest onder attributes.temperature i.p.v. het
  // vlakke state-veld dat lampen/switches gebruiken.
  async function setDeviceTemperature(device, temperature) {
    if (!houseReachable) {
      showToast(t('toast.boxUnreachable'), 'error')
      return
    }
    const stateRecord = device.expand?.device_state_via_device?.[0]
    // Een Zigbee-radiatorknop meldt zijn doel plat (occupied_heating_setpoint)
    // en dat leest de kaart eerst: ook dat bijwerken, anders springt hij terug
    // tot de knop antwoordt.
    const flat = typeof stateRecord?.state?.occupied_heating_setpoint === 'number' ? { occupied_heating_setpoint: temperature } : {}
    const optimisticState = {
      ...stateRecord,
      state: {
        ...stateRecord?.state,
        ...flat,
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
      showToast(
          describeError(t, t('errors.what.setTemperature', { name: device.name, temperature: formatTemperature(temperature, locale) }), err),
          'error'
        )
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
  // options.done: van inflight.begin, bij elk einde (ook stilletjes gestopt).
  function watchCommand(commandId, deviceName, deviceId, options = {}) {
    let unsub
    let stopped = false
    const slowTimer = setTimeout(() => {
      showToast(t('toast.slow', { name: deviceName }))
    }, COMMAND_SLOW_MS)
    const giveUpTimer = setTimeout(() => {
      if (stopped) return
      stop()
      options.onSettled?.('failed')
      showToast(t('toast.gaveUp', { name: deviceName }), 'error')
      fetchAll()
    }, COMMAND_GIVE_UP_MS)

    function stop() {
      if (stopped) return
      stopped = true
      options.done?.()
      clearTimeout(slowTimer)
      clearTimeout(giveUpTimer)
      unsub?.()
    }

    // Eén afloop, via het realtime-event of via het nalezen hieronder.
    function settle(record) {
      if (stopped || record.status === 'pending') return
      stop()
      options.onSettled?.(record.status)
      // De box heeft het uitgevoerd: dat is de bevestiging, ook als de
      // nieuwe stand (device_state) nog onderweg is. Loopt er nog een
      // nieuwer commando, dan blijft het voornemen staan (settleDevice).
      if (record.status !== 'failed' && deviceId) {
        const running = inflight.current.count(deviceId)
        setDevices((prev) => prev.map((d) => (d.id === deviceId ? settleDevice(d, running) : d)))
      }
      // De agent-foutmelding (record.error) is technisch en Engels —
      // die hoort in de console, niet in de melding voor de bewoner.
      if (record.status === 'failed') {
        console.error('[command] mislukt:', record.error)
        showToast(
          options.failMessage ?? t('toast.failed', { name: deviceName }),
          'error'
        )
        fetchAll()
      }
    }

    // Eerst abonneren, dan één keer nalezen: de box zet een snel commando
    // binnen milliseconden op "sent", vaak voordat het abonnement er is.
    pb.collection('commands')
      .subscribe(commandId, (e) => settle(e.record))
      .then((u) => {
        if (stopped) {
          u()
          return
        }
        unsub = u
        return pb
          .collection('commands')
          .getOne(commandId, { requestKey: null })
          .then(settle)
      })
      .catch(() => {
        // Best-effort — als het abonneren zelf al mislukt (bv. even
        // offline) vangt de giveUpTimer het op met een fetchAll.
      })

    return stop
  }

  // Een nieuwe favoriet komt achteraan.
  // Favorieten zijn per persoon: een eigen record, niet een vlag op het
  // apparaat (dan zou je Home ook dat van je huisgenoten veranderen).
  async function addFavorite(deviceId) {
    const created = await pb.collection('favorites').create({
      user: pb.authStore.record.id,
      device: deviceId,
      order: nextOrder(favoritesInHouse),
    })
    setFavorites((prev) => [...prev.filter((f) => f.id !== created.id), created])
  }

  async function toggleFavorite(device) {
    const existing = favoriteFor(favorites, device.id)
    if (!existing) return addFavorite(device.id)
    await pb.collection('favorites').delete(existing.id)
    setFavorites((prev) => prev.filter((f) => f.id !== existing.id))
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
      showToast(describeError(t, t('errors.what.saveOrder'), err), 'error')
      fetchAll()
    }
  }

  function moveRoom(roomId, delta) {
    moveInList(roomsInHouse, roomId, delta, 'order', 'rooms', setRooms)
  }

  function moveFavorite(deviceId, delta) {
    const ordered = favoriteDevices.map((d) => favoriteFor(favorites, d.id))
    moveInList(ordered, favoriteFor(favorites, deviceId)?.id, delta, 'order', 'favorites', setFavorites)
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
        showToast(describeError(t, t('errors.what.deleteNamed', { name: label }), err), 'error')
      }
      unhide()
    }, UNDO_MS)
    showToast(t('toast.deleted', { label }), 'info', {
      label: t('toast.undo'),
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
      t('toast.labelDevice', { name: device?.name ?? t('toast.aDevice') }),
      () => pb.collection('devices').delete(deviceId),
      () => setDevices((prev) => prev.filter((d) => d.id !== deviceId))
    )
  }

  // Een apparaat is gekoppeld (PairingSheet): de box maakte het device, de
  // realtime devices-subscription brengt het binnen. Zolang Home nog geen
  // favorieten heeft, komt het daar meteen op te staan: je eerste lamp moet
  // je direct kunnen aanzetten. De thermostaat staat er altijd al.
  // De sheet meldt elk apparaat één keer.
  async function addedFromPairing(candidate) {
    if (!candidate.device || candidate.type === 'climate' || favoriteDevices.length > 0) return
    try {
      await addFavorite(candidate.device)
    } catch (err) {
      showToast(describeError(t, t('errors.what.addToHome'), err), 'error')
    }
  }

  // F2: één stand van de verwarming (alleen beheerders; house_rules.pb.js).
  async function saveClimatePreset(preset, temperature) {
    const updated = await pb.collection('houses').update(house.id, { [`climate_${preset}`]: temperature })
    setHouses((prev) => prev.map((h) => (h.id === updated.id ? updated : h)))
  }

  async function renameHouse(name) {
    const updated = await pb.collection('houses').update(house.id, { name })
    setHouses((prev) => prev.map((h) => (h.id === updated.id ? updated : h)))
  }

  async function addRoom(name) {
    const order = roomsInHouse.length
    const created = await pb.collection('rooms').create({ house: house.id, name, order })
    setRooms((prev) => [...prev, created])
    return created
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
      t('toast.labelRoom', { name: room?.name ?? '' }),
      () => pb.collection('rooms').delete(roomId),
      () => setRooms((prev) => prev.filter((r) => r.id !== roomId))
    )
  }

  // Stabiele handlers voor de (gememoiseerde) DeviceCards: één object dat
  // nooit van identiteit verandert, maar altijd de nieuwste versie van de
  // functies hierboven aanroept via de ref. Zo her-rendert een kaart alleen
  // als zijn eigen device, de kamers of zijn animatie-status verandert —
  // niet bij elke toast, modal of realtime-tik op de pagina.
  // Een scène uitvoeren: één commando, de box doet de rest (zie runScene in
  // de agent). De tegel zegt "Wordt uitgevoerd" tot de box klaar is, en
  // dan even "Klaar"; de apparaten zelf veranderen via de realtime stand.
  async function runScene(scene) {
    if (!houseReachable) {
      showToast(t('toast.boxUnreachable'), 'error')
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
        failMessage: t('toast.sceneIncomplete', { name: scene.name }),
        onSettled: (status) => {
          if (status !== 'sent') return setRun(null)
          setRun('done')
          setTimeout(() => setRun(null), 2000)
        },
      })
    } catch (err) {
      if (isSessionExpired(err)) return endExpiredSession()
      setRun(null)
      showToast(describeError(t, t('errors.what.runScene', { name: scene.name }), err), 'error')
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
    // Een zon-schema heeft geen tijd, een tijd-schema geen verschuiving
    // (schedule_rules.js).
    const sun = row.trigger === 'sunrise' || row.trigger === 'sunset'
    const fields = {
      trigger: row.trigger,
      time: sun ? '' : row.time,
      offset_min: sun ? row.offset : 0,
      days: row.days,
      enabled: row.enabled,
    }
    const record = row.id
      ? await pb.collection('schedules').update(row.id, fields)
      : await pb.collection('schedules').create({ ...fields, house: house.id, scene: sceneId })
    setSchedules((prev) => [...prev.filter((s) => s.id !== record.id), record])
    return record
  }

  // De schakelaar op een schema-kaart: meteen om, en terug als het opslaan
  // mislukt.
  async function setScheduleEnabled(schedule, enabled) {
    const flip = (value) => setSchedules((prev) => prev.map((s) => (s.id === schedule.id ? { ...s, enabled: value } : s)))
    flip(enabled)
    try {
      await pb.collection('schedules').update(schedule.id, { enabled }, { requestKey: null })
    } catch (err) {
      if (isSessionExpired(err)) return endExpiredSession()
      flip(!enabled)
      showToast(
        describeError(t, t(enabled ? 'errors.what.scheduleOn' : 'errors.what.scheduleOff', { time: scheduleName(intl, schedule) }), err),
        'error'
      )
    }
  }

  async function deleteSchedule(scheduleId) {
    await pb.collection('schedules').delete(scheduleId)
    setSchedules((prev) => prev.filter((s) => s.id !== scheduleId))
  }

  // Bewegingslichten: de box leest ze binnen een minuut (het snapshot).
  async function saveMotionLight(id, fields) {
    const record = id
      ? await pb.collection('motion_lights').update(id, fields)
      : await pb.collection('motion_lights').create({ ...fields, house: house.id, enabled: true })
    setMotionLights((prev) => [...prev.filter((m) => m.id !== record.id), record])
    return record
  }

  // De schakelaar op een kaart: meteen om, en terug als opslaan mislukt.
  async function setMotionLightEnabled(rule, enabled) {
    const flip = (value) => setMotionLights((prev) => prev.map((m) => (m.id === rule.id ? { ...m, enabled: value } : m)))
    flip(enabled)
    try {
      await pb.collection('motion_lights').update(rule.id, { enabled }, { requestKey: null })
    } catch (err) {
      if (isSessionExpired(err)) return endExpiredSession()
      flip(!enabled)
      const name = devices.find((d) => d.id === rule.sensor)?.name ?? ''
      showToast(describeError(t, t(enabled ? 'errors.what.motionOn' : 'errors.what.motionOff', { name }), err), 'error')
    }
  }

  async function deleteMotionLight(id) {
    await pb.collection('motion_lights').delete(id)
    setMotionLights((prev) => prev.filter((m) => m.id !== id))
  }

  // Routines: de box leest ze binnen een minuut (het snapshot).
  async function saveRoutine(id, fields) {
    const record = id
      ? await pb.collection('automations').update(id, fields)
      : await pb.collection('automations').create({ ...fields, house: house.id, enabled: true })
    setRoutines((prev) => [...prev.filter((r) => r.id !== record.id), record])
    return record
  }

  // De schakelaar op een kaart: meteen om, en terug als opslaan mislukt.
  async function setRoutineEnabled(routine, enabled) {
    const flip = (value) => setRoutines((prev) => prev.map((r) => (r.id === routine.id ? { ...r, enabled: value } : r)))
    flip(enabled)
    try {
      await pb.collection('automations').update(routine.id, { enabled }, { requestKey: null })
    } catch (err) {
      if (isSessionExpired(err)) return endExpiredSession()
      flip(!enabled)
      const name = routineTitle(intl, routine, routineNames)
      showToast(describeError(t, t(enabled ? 'errors.what.routineOn' : 'errors.what.routineOff', { name }), err), 'error')
    }
  }

  async function deleteRoutine(id) {
    await pb.collection('automations').delete(id)
    setRoutines((prev) => prev.filter((r) => r.id !== id))
  }

  // Wacht tot de box een commando afhandelde: 'sent' of 'failed' (ook na
  // COMMAND_GIVE_UP_MS zonder antwoord). Zonder meldingen: de sheet zegt
  // zelf hoe het ging.
  function commandOutcome(commandId) {
    return new Promise((resolve) => {
      let unsub
      let finished = false
      const finish = (status) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        unsub?.()
        resolve(status)
      }
      const timer = setTimeout(() => finish('failed'), COMMAND_GIVE_UP_MS)
      const settle = (record) => record.status !== 'pending' && finish(record.status)
      pb.collection('commands')
        .subscribe(commandId, (e) => settle(e.record))
        .then((u) => {
          unsub = u
          if (finished) u()
          return pb.collection('commands').getOne(commandId, { requestKey: null }).then(settle)
        })
        .catch(() => {})
    })
  }

  // "Nu uitproberen": de stappen van een routine één keer, op volgorde, met
  // de commando's die er al zijn (aan/uit met payload, run_scene). Geeft de
  // namen terug van wat niet lukte.
  async function tryRoutine(actions) {
    const failed = []
    for (const action of actions) {
      // Een melding verstuurt alleen de box; die slaat uitproberen over.
      if (action.kind === 'notify') continue
      // Een klimaatstand: per thermostaat aan en naar de temperatuur.
      if (action.kind === 'climate') {
        const targets = action.device ? [action.device] : devicesInHouse.filter((d) => d.type === 'climate').map((d) => d.id)
        for (const device of targets) {
          for (const fields of [
            { device, action: 'turn_on', status: 'pending' },
            { device, action: 'set_temperature', payload: { temperature: climatePresets[action.preset] }, status: 'pending' },
          ]) {
            try {
              const command = await pb.collection('commands').create(fields, { requestKey: null })
              if ((await commandOutcome(command.id)) === 'failed') failed.push(routineNames.devices[device] ?? '?')
            } catch (err) {
              if (isSessionExpired(err)) {
                endExpiredSession()
                return { failed }
              }
              failed.push(routineNames.devices[device] ?? '?')
            }
          }
        }
        continue
      }
      const scene = action.kind === 'scene'
      const name = scene ? routineNames.scenes[action.scene] : routineNames.devices[action.device]
      try {
        const fields = scene
          ? { scene: action.scene, action: 'run_scene', status: 'pending' }
          : { device: action.device, action: action.action, status: 'pending', ...(action.payload ? { payload: action.payload } : {}) }
        const command = await pb.collection('commands').create(fields, { requestKey: null })
        if ((await commandOutcome(command.id)) === 'failed') failed.push(name ?? '?')
      } catch (err) {
        if (isSessionExpired(err)) {
          endExpiredSession()
          return { failed }
        }
        console.error('[routine] uitproberen:', err)
        failed.push(name ?? '?')
      }
    }
    return { failed }
  }

  function deleteScene(sceneId) {
    const scene = scenes.find((s) => s.id === sceneId)
    deleteLater(
      sceneId,
      t('toast.labelScene', { name: scene?.name ?? '' }),
      () => pb.collection('scenes').delete(sceneId),
      () => setScenes((prev) => prev.filter((s) => s.id !== sceneId))
    )
  }

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

  if (loggedIn === null) {
    return <main className="app-boot" aria-busy="true" />
  }

  if (!loggedIn) {
    const otherLanguage = language === 'nl' ? 'en' : 'nl'
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
            {/* Losse letters voor de animatie; aria-label zodat een
                schermlezer één woord leest, geen tien letters. */}
            <h1 className="login-title" aria-label="Sandhovius">
              {[...'Sandhovius'].map((letter, i) => (
                <span key={i} className="login-title-letter" aria-hidden="true" style={{ '--l': i }}>
                  {letter}
                </span>
              ))}
            </h1>
            <p className="login-lede">{signupMode ? t('login.ledeSignup') : t('login.lede')}</p>
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
                    {t('login.resetSent', { email })}
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setResetMode(false)
                      setResetSent(false)
                    }}
                  >
                    {t('login.backToLogin')}
                  </button>
                </div>
              ) : (
                <form onSubmit={requestReset} className="form-stack">
                  <p className="login-note">{t('login.resetNote')}</p>
                  <label className="form-field">
                    <span className="form-label">{t('login.email')}</span>
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
                    {t('login.sendReset')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-plain login-link"
                    onClick={() => {
                      setResetMode(false)
                      setError('')
                    }}
                  >
                    {t('login.backToLogin')}
                  </button>
                </form>
              )
            ) : (
              <form onSubmit={login} className="form-stack">
                <label className="form-field">
                  <span className="form-label">{t('login.email')}</span>
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
                  <span className="form-label">{t('login.password')}</span>
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
                    t('login.welcome')
                  ) : loggingIn ? (
                    <>
                      <span className="spinner" aria-hidden="true" />
                      {t('login.submitting')}
                    </>
                  ) : (
                    t('login.submit')
                  )}
                </button>
                <div className="login-links">
                  <button
                    type="button"
                    className="btn btn-plain login-link"
                    onClick={() => {
                      setResetMode(true)
                      setError('')
                    }}
                  >
                    {t('login.forgot')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-plain login-link"
                    onClick={() => {
                      setSignupMode(true)
                      setError('')
                    }}
                  >
                    {t('login.createAccount')}
                  </button>
                </div>
              </form>
            )}
            {/* De andere taal, in die taal zelf: wie hem zoekt, herkent hem.
                Ook tijdens het aanmaken: het account krijgt deze taal. */}
            <button
              type="button"
              className="btn btn-plain login-link login-language"
              lang={otherLanguage}
              onClick={() => setLanguage(otherLanguage)}
            >
              {t(`language.${otherLanguage}`)}
            </button>
          </div>
        </div>
      </main>
    )
  }

  const roomNameById = Object.fromEntries(roomsInHouse.map((room) => [room.id, room.name]))
  const climateDevices = devicesInHouse.filter((device) => device.type === 'climate')
  // De thermostaat staat altijd op Home; de rest alleen als favoriet.
  // Op de volgorde die de bewoner koos; zonder keuze op naam.
  const favoriteDevices = favoriteDevicesOf(devicesInHouse, favorites)
  const favoritesInHouse = favorites.filter((f) => devicesInHouse.some((d) => d.id === f.device))
  // Alleen als de box bereikbaar is: anders weten we niet zeker wat er aan
  // staat.
  const shelfDevices = houseReachable ? devicesInHouse.filter((device) => shelfIds.includes(device.id)) : []
  // Home: wat er naast de favorieten nog aan staat (de favorieten zie je al).
  const otherOnDevices = shelfDevices.filter((device) => !favoriteDevices.some((f) => f.id === device.id))
  // De zin onder de groet ("2 lampen aan, binnen 20,5°"). Alleen als de box
  // bereikbaar is; anders weten we niet wat er aan staat.
  const knowsState = loaded && houseReachable
  // Een stekker die als lamp staat telt als lamp ("2 lampen aan").
  // E2: wat uit de samenvatting is gehaald, telt hier niet mee.
  const summaryOn = devicesOn.filter(countsInSummary)
  const lightsOn = knowsState ? summaryOn.filter((device) => displayType(device) === 'light').length : 0
  const summary = knowsState
    ? houseSummary(intl, {
        lightsOn,
        plugsOn: summaryOn.length - lightsOn,
        indoor: indoorTemperature(
          devicesInHouse
            .filter(countsInSummary)
            .map((device) => ({ type: device.type, state: device.expand?.device_state_via_device?.[0]?.state }))
        ),
      })
    : null
  // De knoppen op Home (Licht, Klimaat, Veiligheid, Water) met de stand
  // erin. Zijn ze er, dan dragen zij de stand en zegt de regel onder de groet
  // alleen nog het weer: één plek voor "2 lampen aan".
  const categories = loaded && house ? categorySummary(intl, devicesInHouse, { known: houseReachable }) : []
  const userEmail = pb.authStore.record?.email

  const errorBanner = error && (
    <div className="error-banner" role="alert">
      <span>{error}</span>
      {fetchFailed && (
        <button type="button" className="btn btn-secondary error-banner-action" onClick={retryFetch}>
          {t('common.retry')}
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

  const invitationCards = myInvitations.length > 0 && (
    <div className="invitation-list">
      {myInvitations.map((invitation) => (
        <InvitationCard
          key={invitation.id}
          invitation={invitation}
          onAccept={acceptInvitation}
          onDecline={deleteInvitation}
        />
      ))}
    </div>
  )

  // Zonder huis maar met een uitnodiging: de uitnodiging(en) in plaats van de
  // uitleg; "Box toevoegen" blijft eronder.
  const noHouse = loaded && !house && (myInvitations.length > 0 ? (
    <div className="empty-state-invitations">
      {invitationCards}
      <button type="button" className="btn btn-secondary empty-state-action" onClick={() => setClaim({ initial: null })}>
        {t('home.addBox')}
      </button>
    </div>
  ) : (
    <p className="empty-state">
      {t('home.noHouse')}
      <button type="button" className="btn btn-primary empty-state-action" onClick={() => setClaim({ initial: null })}>
        {t('home.addBox')}
      </button>
    </p>
  ))

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
        {t('home.firstDevice.title')}
      </h2>
      <p className="intro-panel-text">{canEdit ? t('home.firstDevice.text') : t('rights.askAdmin')}</p>
      {canEdit && (
        <button type="button" className="btn btn-primary" onClick={() => setAddDeviceOpen(true)}>
          <PlusIcon width="20" height="20" aria-hidden="true" />
          {t('nav.addDevice')}
        </button>
      )}
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
        presets={climatePresets}
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
    const groups = [...roomsInHouse.map((room) => ({ id: room.id, name: room.name })), { id: null, name: t('home.noRoom') }]
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

  // Op de Kamers-tab voeg je kamers toe; een apparaat via de "+" onderin.
  const addRoomButton = house && (
    <button type="button" className="btn btn-primary btn-add" onClick={() => setAddingRoom(true)}>
      <PlusIcon width="20" height="20" aria-hidden="true" />
      {t('rooms.addRoom')}
    </button>
  )

  let header
  let content
  if (tab === 'kamers') {
    const count = devicesInSelectedRoom.length
    header = <Header title={t('nav.kamers')} action={canEdit ? addRoomButton : null} />
    content = (
      <>
        {errorBanner}
        {noHouse}
        {/* Breed: de kamers als lijst links, elk met een schakelaar, en de
            gekozen kamer ernaast. Telefoon: de kamerpillen, met de
            schakelaar van de gekozen kamer naast het aantal. */}
        <div className="rooms-layout">
          {roomTabs.length > 0 && (
            <RoomsPanel
              rooms={roomTabs}
              selectedId={selectedRoomId}
              onSelect={selectRoom}
              reachable={houseReachable}
              onSwitch={switchRoom}
            />
          )}
          <div className="rooms-detail">
            {roomTabs.length > 0 && (
              <div className="rooms-bar">
                <RoomTabs tabs={roomTabs} selectedId={selectedRoomId} onSelect={selectRoom} />
              </div>
            )}
            {loaded && house && selectedRoom && (
              <div className="room-head">
                <div className="room-head-titles">
                  <h2 className="room-head-title">{selectedRoom.label}</h2>
                  {count > 0 && <p className="section-count">{t('rooms.count', { count })}</p>}
                </div>
                {selectedRoom.switchable.length > 0 && (
                  <div className="room-head-switch">
                    <span className="room-head-state" aria-hidden="true">
                      {describeRoom(t, selectedRoom, houseReachable)}
                    </span>
                    <RoomSwitch room={selectedRoom} canSwitch={houseReachable} onSwitch={switchRoom} />
                  </div>
                )}
              </div>
            )}
            {firstDevice}
            {loaded && house && count === 0 && devicesInHouse.length > 0 && (
              <p className="empty-state">
                {t('rooms.empty')}
              </p>
            )}
            {skeleton}
            {renderDevices(devicesInSelectedRoom)}
          </div>
        </div>
      </>
    )
  } else if (tab === 'scenes') {
    header = <Header title={t('nav.scenes')} />
    content = (
      <>
        {errorBanner}
        {noHouse}
        {skeleton}
        {loaded && house && (
          <ScenesView
            canEdit={canEdit}
            scenes={scenesInHouse}
            schedules={schedules}
            deviceNameById={Object.fromEntries(devicesInHouse.map((d) => [d.id, d.name]))}
            runState={sceneRunState}
            canRun={houseReachable}
            onRun={runScene}
            onEdit={(scene) => setEditingScene(scene.id)}
            onCreate={() => setEditingScene('new')}
            onToggleSchedule={setScheduleEnabled}
            motionLights={motionLightsInHouse}
            deviceById={Object.fromEntries(devicesInHouse.map((d) => [d.id, d]))}
            onEditMotion={(rule) => setEditingMotion(rule === 'new' ? 'new' : rule.id)}
            onToggleMotion={setMotionLightEnabled}
            routines={routinesInHouse}
            routineNames={routineNames}
            onEditRoutine={(routine) => setEditingRoutine(routine === 'new' ? 'new' : routine.id)}
            onToggleRoutine={setRoutineEnabled}
          />
        )}
      </>
    )
  } else if (tab === 'instellingen') {
    header = <Header title={t('nav.instellingen')} />
    content = (
      <>
        {errorBanner}
        <SettingsView
          house={house}
          connection={
            <ConnectionStatus
              realtimeLink={realtimeLink}
              house={{ ...houseLink, softwareSince: house?.box_version_since, softwareVersion: house?.box_version }}
              now={now}
            />
          }
          isAdmin={houseAdmin}
          notifications={
            house && (
              <NotificationsSection
                house={house}
                userId={userId}
                language={language}
                subscriptions={pushSubscriptions}
                onCreate={createPushSubscription}
                onDelete={deletePushSubscription}
              />
            )
          }
          household={
            house && (
              <HouseholdSection
                house={house}
                userId={userId}
                admin={houseAdmin}
                invitations={houseInvitations}
                presence={presenceInHouse}
                loadMembers={() => pb.send(`/api/sandhovius/houses/${house.id}/members`, { method: 'GET' })}
                onInvite={inviteMember}
                onChangeRole={changeMemberRole}
                onSetCanEdit={setMemberCanEdit}
                onRemove={removeMember}
                onRevoke={(id) => deleteInvitation({ id })}
              />
            )
          }
          houses={houses}
          onSelectHouse={selectHouse}
          roomCount={roomsInHouse.length}
          userEmail={userEmail}
          onChangeLanguage={changeLanguage}
          onOpenHouse={() => setHouseModalOpen(true)}
          onAddBox={() => setClaim({ initial: null })}
          onChangePassword={() => setChangingPassword(true)}
          onLogout={logout}
        />
      </>
    )
  } else {
    header = (
      <Header
        title={greeting(intl, new Date(now), pb.authStore.record?.name)}
        subtitle={formatToday(now, locale)}
        lede={
          house
            ? homeLede(intl, {
                summary: categories.length > 0 ? null : summary,
                weather: house.weather,
                weatherStale: isWeatherStale(house.weather_updated, now),
              })
            : null
        }
        action={
          // Alleen als de box bereikbaar is: anders weten we niet zeker wat er
          // aan staat, en zegt de melding bovenaan genoeg.
          loaded && houseReachable && devicesOn.length > 0 ? (
            <button type="button" className="btn btn-secondary home-all-off" onClick={turnAllOff}>
              <PowerIcon width="18" height="18" aria-hidden="true" />
              {t('home.allOff')}
            </button>
          ) : null
        }
      />
    )
    content = (
      <>
        {errorBanner}
        {noHouse}
        {house && invitationCards}
        {loaded && house && userId && (
          <PresenceBar me={userId} members={houseMembers} rows={presenceInHouse} onChange={setMyPresence} />
        )}
        {house && (
          <HomeNotices
            realtimeLink={realtimeLink}
            houseLink={houseLink}
            now={now}
            attention={loaded ? attention : []}
            onOpenDevice={(device) => setSettingsDeviceId(device.id)}
          />
        )}
        <div className="dashboard">
          {/* Breed: het weer in een kaart links. Op de telefoon staat het in
              de regel onder de groet. */}
          {house?.weather?.condition && (
            <div className="dashboard-side">
              <WeatherCard weather={house.weather} updated={house.weather_updated} now={now} />
            </div>
          )}

          <div className="dashboard-devices">
            {skeleton}

            {firstDevice}

            {categories.length > 0 && (
              <HomeCategories
                categories={categories}
                renderByRoom={renderByRoom}
                canSwitch={houseReachable}
                onLightsOff={turnLightsOff}
              />
            )}

            {loaded && house && devicesInHouse.length > 0 && (
              <div className="home-grid">
                {scenesInHouse.length > 0 && (
                  <HomeScenes
                    scenes={scenesInHouse}
                    runState={sceneRunState}
                    canRun={houseReachable}
                    onRun={runScene}
                    onEdit={(scene) => canEdit && setEditingScene(scene.id)}
                  />
                )}

                {/* Je vaste knoppen, en daaronder wat er verder nog aan staat:
                    geen keuzebalk, Home laat gewoon het huis zien. */}
                <div className="home-section home-devices">
                  <section className="home-devices-group" aria-labelledby="home-favorites">
                    <div className="section-head">
                      <h2 id="home-favorites" className="section-heading">
                        {t('home.favorites')}
                      </h2>
                      {favoriteDevices.length > 1 && (
                        <button type="button" className="btn btn-plain section-action" onClick={() => setOrderingFavorites(true)}>
                          {t('home.order')}
                        </button>
                      )}
                    </div>
                    {favoriteDevices.length > 0 ? (
                      renderByRoom(favoriteDevices)
                    ) : (
                      <div className="panel home-welcome">
                        <span className="device-icon" aria-hidden="true">
                          <LightbulbIcon width="22" height="22" />
                        </span>
                        <div>
                          <p className="home-welcome-title">{t('home.welcome.title')}</p>
                          <p className="home-welcome-text">{t('home.welcome.text')}</p>
                        </div>
                      </div>
                    )}
                  </section>

                  {otherOnDevices.length > 0 && (
                    <section className="home-devices-group" aria-labelledby="home-on">
                      <h2 id="home-on" className="section-heading">
                        {t('home.nowOn')}
                      </h2>
                      {renderByRoom(otherOnDevices)}
                    </section>
                  )}
                </div>

                {climateDevices.length > 0 && (
                  <section className="home-section home-climate" aria-label={t('home.temperature')}>
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
        <div ref={tabViewRef} className="tab-content">
          {header}

          <main className="container">{content}</main>
        </div>
      </div>

      <BottomNav activeTab={tab} onSelect={selectTab} onAdd={house && canEdit ? () => setAddDeviceOpen(true) : null} />

      {houseModalOpen && (
        <HouseModal
          house={house}
          isAdmin={houseAdmin}
          canEdit={canEdit}
          rooms={roomsInHouse}
          onRenameHouse={renameHouse}
          hasClimate={devicesInHouse.some((d) => d.type === 'climate')}
          onSaveClimatePreset={saveClimatePreset}
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
          // Vervangen mag alleen een beheerder van dat huis.
          houses={houses.filter((h) => isAdmin(h, userId))}
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

      {editingMotion && (
        <MotionLightSheet
          key={editingMotion}
          rule={editingMotion === 'new' ? null : motionLightsInHouse.find((m) => m.id === editingMotion)}
          sensors={sensorsForMotion(editingMotion)}
          switchables={byRoom(switchableDevices(devicesInHouse), roomsInHouse)}
          roomNameById={roomNameById}
          onSave={saveMotionLight}
          onDelete={deleteMotionLight}
          onClose={() => setEditingMotion(null)}
        />
      )}

      {addingRoom && (
        <AddRoomSheet
          onAdd={async (name) => {
            const created = await addRoom(name)
            selectRoom(created.id)
          }}
          onClose={() => setAddingRoom(false)}
        />
      )}

      {editingRoutine && (
        <RoutineSheet
          key={editingRoutine}
          routine={editingRoutine === 'new' ? null : routinesInHouse.find((r) => r.id === editingRoutine)}
          sensors={byRoom(routineSensors(devicesInHouse), roomsInHouse)}
          switchables={byRoom(switchableDevices(devicesInHouse), roomsInHouse)}
          scenes={scenesInHouse}
          names={routineNames}
          roomNameById={roomNameById}
          members={houseMembers}
          climates={byRoom(devicesInHouse.filter((d) => d.type === 'climate'), roomsInHouse)}
          canTry={houseReachable}
          onSave={saveRoutine}
          onDelete={deleteRoutine}
          onTry={tryRoutine}
          onClose={() => setEditingRoutine(null)}
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
        <PairingSheet
          pb={pb}
          houseId={house.id}
          rooms={roomsInHouse}
          defaultRoomId={selectedRoomId === '__unassigned' ? '' : selectedRoomId}
          houseReachable={houseReachable}
          onAdded={addedFromPairing}
          onClose={() => setAddDeviceOpen(false)}
        />
      )}

      {settingsDevice && (
        <DeviceSettingsModal
          canEdit={canEdit}
          key={settingsDevice.id}
          device={settingsDevice}
          rooms={roomsInHouse}
          onSave={saveDevice}
          onSaveError={(message) => showToast(message, 'error')}
          favorite={!!favoriteFor(favorites, settingsDevice.id)}
          onToggleFavorite={toggleFavorite}
          onSetLight={setLight}
          onIdentify={identifyDevice}
          houseReachable={houseReachable}
          notifyRules={notifyRules.filter((r) => r.device === settingsDevice.id && r.user === userId)}
          onSaveNotifyRule={saveNotifyRule}
          onDelete={deleteDevice}
          onClose={() => setSettingsDeviceId(null)}
        />
      )}
    </>
  )
}
