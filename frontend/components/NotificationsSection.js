'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'use-intl'
import { keyBytes, pushState, pushSupport, subscriptionRecord } from '../lib/push'
import { describeError } from '../lib/errors'

// Opties → Meldingen (spec 2026-10-14-notifications-design.md): dit apparaat
// aanmelden voor meldingen van de box. De box verstuurt met zijn eigen
// sleutel (house.push_key); een vervangen box heeft een andere sleutel, dan
// meldt deze sectie het apparaat stil opnieuw aan.
//
// subscriptions: je eigen aanmeldingen (alle apparaten); onCreate(fields)
// en onDelete(id) slaan op in PocketBase.
export default function NotificationsSection({ house, userId, language, subscriptions, onCreate, onDelete }) {
  const t = useTranslations()
  const [support, setSupport] = useState(null) // null tot we het weten
  const [permission, setPermission] = useState('default')
  const [endpoint, setEndpoint] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
    const hasPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    const found = pushSupport({ hasPush, standalone, ios })
    let cancelled = false
    if (found === 'ok') {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((registration) => registration.pushManager.getSubscription())
        .then((sub) => {
          if (cancelled) return
          setPermission(Notification.permission)
          setEndpoint(sub?.endpoint ?? null)
          setSupport(found)
        })
        .catch((err) => {
          console.error('[meldingen] service worker:', err)
          if (!cancelled) setSupport('unsupported')
        })
    } else {
      Promise.resolve().then(() => !cancelled && setSupport(found))
    }
    return () => {
      cancelled = true
    }
  }, [])

  const mine = endpoint ? subscriptions.find((s) => s.endpoint === endpoint && s.house === house.id) : null
  const state = support === null ? null : pushState({ support, permission, houseKey: house.push_key, mine })

  // Aanmelden met de sleutel van de box van nu. Een oude aanmelding (andere
  // sleutel) eerst weg, in de browser én in PocketBase.
  async function subscribe() {
    const granted = await Notification.requestPermission()
    setPermission(granted)
    if (granted !== 'granted') return
    const registration = await navigator.serviceWorker.ready
    const old = await registration.pushManager.getSubscription()
    if (old) {
      const stale = subscriptions.find((s) => s.endpoint === old.endpoint && s.house === house.id)
      if (stale) await onDelete(stale.id)
      await old.unsubscribe()
    }
    const sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(house.push_key) })
    await onCreate(subscriptionRecord(sub.toJSON(), { house: house.id, user: userId, key: house.push_key, language }))
    setEndpoint(sub.endpoint)
  }

  async function unsubscribe() {
    const registration = await navigator.serviceWorker.ready
    const sub = await registration.pushManager.getSubscription()
    if (mine) await onDelete(mine.id)
    if (sub) await sub.unsubscribe()
    setEndpoint(null)
  }

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(describeError(t, t('errors.what.notifications'), err))
    } finally {
      setBusy(false)
    }
  }

  // Een vervangen box: stil opnieuw aanmelden, de toestemming is er al.
  useEffect(() => {
    if (state !== 'stale' || busy) return
    run(subscribe)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <section className="panel settings-section" aria-labelledby="settings-notifications">
      <h2 id="settings-notifications" className="settings-heading">
        {t('notifications.title')}
      </h2>
      <div className="settings-notifications">
        {state && (
          <p className="settings-hint" role="status">
            {t(`notifications.states.${state}`)}
          </p>
        )}
        {state === 'off' && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(subscribe)}>
            {t('notifications.turnOn')}
          </button>
        )}
        {state === 'on' && (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run(unsubscribe)}>
            {t('notifications.turnOff')}
          </button>
        )}
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}
