// Maakt de app installeerbaar ("Zet op beginscherm"): eigen naam, icoon en
// een volledig scherm zonder browserbalk. Geen service worker nodig om te
// installeren; offline werken doet de box zelf, niet de browser.
export default function manifest() {
  return {
    name: 'Sandhovius',
    short_name: 'Sandhovius',
    description: 'Je huis bedienen, lokaal en privé.',
    lang: 'nl',
    start_url: '/',
    display: 'standalone',
    background_color: '#100e0c',
    theme_color: '#100e0c',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Het icoon houdt alles binnen de veilige zone, dus het mag ook als
      // maskable (Android knipt het rond of afgerond bij).
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Lang indrukken op het app-icoon (Android, desktop): vaste
    // snelkoppelingen, want een PWA kan geen eigen scènes in het menu zetten.
    // page.js voert ?do=all-off één keer uit.
    shortcuts: [
      { name: 'Alles uit', short_name: 'Alles uit', url: '/?do=all-off', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Scènes', short_name: 'Scènes', url: '/#scenes', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
