'use client'

import { useEffect, useState } from 'react'
import PocketBase from 'pocketbase'
import { useTheme } from '../lib/useTheme'
import Header from '../components/Header'
import DeviceCard from '../components/DeviceCard'

const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL)

export default function Home() {
  const { isDarkMode, toggleTheme } = useTheme()

  const [loggedIn, setLoggedIn] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [gatewayName, setGatewayName] = useState('')
  const [devices, setDevices] = useState([])
  const [pendingDeviceIds, setPendingDeviceIds] = useState([])

  useEffect(() => {
    setLoggedIn(pb.authStore.isValid)
  }, [])

  useEffect(() => {
    if (loggedIn) {
      fetchDevices()
    }
  }, [loggedIn])

  async function login(e) {
    e.preventDefault()
    setError('')
    try {
      await pb.collection('users').authWithPassword(email, password)
      setLoggedIn(true)
    } catch (err) {
      setError('Inloggen mislukt: ' + err.message)
    }
  }

  function logout() {
    pb.authStore.clear()
    setLoggedIn(false)
    setGatewayName('')
    setDevices([])
  }

  // devices.listRule filtert al op gateway.user = @request.auth.id, dus we
  // vragen devices rechtstreeks op i.p.v. eerst zelf per gateway te filteren.
  async function fetchDevices() {
    setError('')
    try {
      const [gatewayRecords, deviceRecords] = await Promise.all([
        pb.collection('gateways').getFullList(),
        pb.collection('devices').getFullList({ expand: 'device_state_via_device' }),
      ])
      setGatewayName(gatewayRecords[0]?.name ?? '')
      setDevices(deviceRecords)
    } catch (err) {
      setError('Kon devices niet ophalen: ' + err.message)
    }
  }

  // Stuurt een "toggle"-commando naar PocketBase; de agent pikt dit
  // realtime op en voert het uit via Home Assistant. Geen live-subscription
  // hier — na een korte wachttijd wordt gewoon opnieuw opgehaald.
  async function toggleDevice(device) {
    setPendingDeviceIds((prev) => [...prev, device.id])
    setError('')
    try {
      await pb.collection('commands').create({
        device: device.id,
        action: 'toggle',
        status: 'pending',
      })
      setTimeout(fetchDevices, 1500)
    } catch (err) {
      setError('Commando versturen mislukt: ' + err.message)
    } finally {
      setTimeout(() => {
        setPendingDeviceIds((prev) => prev.filter((id) => id !== device.id))
      }, 1500)
    }
  }

  const themeAction = {
    label: isDarkMode ? 'Lichte modus' : 'Donkere modus',
    onClick: toggleTheme,
  }

  if (!loggedIn) {
    return (
      <div className="login-container">
        <Header actions={[themeAction]} />
        <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
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
          <button type="submit" className="btn btn-primary">
            Inloggen
          </button>
        </form>
        {error && <p className="error-banner">{error}</p>}
      </div>
    )
  }

  return (
    <div className="container">
      <Header actions={[themeAction, { label: 'Uitloggen', onClick: logout }]} />

      {gatewayName && <p className="gateway-name">{gatewayName}</p>}

      {error && <p className="error-banner">{error}</p>}

      <ul className="device-list">
        {devices.map((device) => (
          <DeviceCard
            key={device.id}
            device={device}
            onToggle={() => toggleDevice(device)}
            isPending={pendingDeviceIds.includes(device.id)}
          />
        ))}
      </ul>
    </div>
  )
}
