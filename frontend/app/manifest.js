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
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Het icoon houdt alles binnen de veilige zone, dus het mag ook als
      // maskable (Android knipt het rond of afgerond bij).
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
