'use client'

import { useEffect, useState } from 'react'
import PocketBase from 'pocketbase'

const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL)

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [gateways, setGateways] = useState([])
  const [devices, setDevices] = useState([])

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
    setGateways([])
    setDevices([])
  }

  // De devices-collectie heeft haar eigen listRule die al filtert op
  // gateway.user = @request.auth.id, dus we hoeven niet eerst zelf de
  // devices per gateway te filteren — PocketBase doet dat al server-side.
  // We halen gateways er wel apart bij om de status/naam te kunnen tonen.
  async function fetchDevices() {
    setError('')
    try {
      const [gatewayRecords, deviceRecords] = await Promise.all([
        pb.collection('gateways').getFullList(),
        pb.collection('devices').getFullList({ expand: 'device_state_via_device' }),
      ])
      setGateways(gatewayRecords)
      setDevices(deviceRecords)
    } catch (err) {
      setError('Kon devices niet ophalen: ' + err.message)
    }
  }

  if (!loggedIn) {
    return (
      <main style={{ maxWidth: 320, margin: '4rem auto', fontFamily: 'sans-serif' }}>
        <h1>Sandhovius</h1>
        <form onSubmit={login} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Wachtwoord"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit">Inloggen</button>
        </form>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 480, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Sandhovius</h1>
        <button onClick={logout}>Uitloggen</button>
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <h2>Gateways</h2>
      <ul>
        {gateways.map((gw) => (
          <li key={gw.id}>
            {gw.name} — {gw.select} (laatst gezien: {gw.last_seen || 'nog nooit'})
          </li>
        ))}
      </ul>

      <h2>Devices</h2>
      <ul>
        {devices.map((device) => {
          const state = device.expand?.device_state_via_device?.[0]
          return (
            <li key={device.id} style={{ marginBottom: '0.75rem' }}>
              <strong>{device.name}</strong> ({device.type}) —{' '}
              {device.online ? 'online' : 'offline'}
              <pre style={{ background: '#f0f0f0', padding: '0.5rem', margin: '0.25rem 0' }}>
                {state ? JSON.stringify(state.state, null, 2) : 'geen state bekend'}
              </pre>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
