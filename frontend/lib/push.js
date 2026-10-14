// Meldingen (spec 2026-10-14-notifications-design.md): de box verstuurt Web
// Push met zijn eigen sleutel (houses.push_key); de app meldt dit apparaat
// aan in push_subscriptions. Hier alleen het rekenwerk, zodat het te testen is.

// De publieke sleutel (base64url) als bytes, voor pushManager.subscribe.
export function keyBytes(base64url) {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

// Kan dit apparaat meldingen ontvangen? 'ok', 'install' (iPhone/iPad: alleen
// als de app op het beginscherm staat) of 'unsupported'. env: { hasPush,
// standalone, ios } — in de app uit window/navigator, in tests met de hand.
export function pushSupport({ hasPush, standalone, ios }) {
  if (ios && !standalone) return 'install'
  return hasPush ? 'ok' : 'unsupported'
}

// De stand van meldingen op dit apparaat, voor de tekst en de knop in Opties.
// permission: Notification.permission; mine: de eigen aanmelding van dit
// apparaat in PocketBase (of null); houseKey: houses.push_key.
export function pushState({ support, permission, houseKey, mine }) {
  if (support !== 'ok') return support
  if (!houseKey) return 'noKey'
  if (permission === 'denied') return 'denied'
  if (!mine) return 'off'
  return mine.key === houseKey ? 'on' : 'stale'
}

// Het record voor push_subscriptions uit PushSubscription.toJSON().
export function subscriptionRecord(json, { house, user, key, language }) {
  return {
    house,
    user,
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh ?? '',
    auth: json.keys?.auth ?? '',
    key,
    language,
  }
}
