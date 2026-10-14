// Service worker van Sandhovius: alleen meldingen (spec
// 2026-10-14-notifications-design.md). Geen fetch-handler en geen cache: de
// app laadt altijd van de server, zoals zonder service worker.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// De box stuurt { title, body }, versleuteld; de browser ontsleutelt.
self.addEventListener('push', (event) => {
  let data = { title: 'Sandhovius', body: '' }
  try {
    data = { ...data, ...event.data.json() }
  } catch {
    if (event.data) data.body = event.data.text()
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      lang: 'nl',
    })
  )
})

// Een tik op de melding: de open app naar voren, anders de app openen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
      return open ? open.focus() : self.clients.openWindow('/')
    })
  )
})
