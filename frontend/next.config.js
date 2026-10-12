/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Pagina's (HTML) altijd eerst bij de server navragen: met de ETag is dat
  // een goedkope 304. Zonder dit gaf Next.js alleen s-maxage (voor een CDN)
  // en kon Safari, zeker in de geïnstalleerde app, een oude pagina tonen die
  // naar JavaScript van de vorige versie wijst; na een update is dat weg en
  // zag je "This page couldn't load". De bestanden in _next/static hebben een
  // hash in hun naam en blijven onbeperkt in de cache (dat regelt Next.js zelf).
  async headers() {
    return [
      {
        source: '/((?!_next/static|_next/image).*)',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
    ]
  },
}

module.exports = nextConfig
