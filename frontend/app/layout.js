import Script from 'next/script'
import { Urbanist } from 'next/font/google'
import './styles/theme.css'
import './styles/base.css'
import './styles/login.css'
import './styles/rooms.css'
import './styles/devices.css'
import './styles/components.css'
import { ThemeProvider } from './ThemeContext'

// Een open (OFL) stand-in voor Lufga uit het merkblad: zelfde vriendelijk-
// geometrische vormen. next/font host hem zelf mee, dus geen verzoek naar
// Google en hij werkt ook als de box geen internet heeft.
const urbanist = Urbanist({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata = {
  title: 'Sandhovius',
  description: 'Sandhovius smart home PWA',
}

// viewport-fit=cover laat de app tot in de hoeken van het scherm lopen
// (notch, afgeronde hoeken); de safe-area-insets in de CSS houden de
// header, +-knop en toasts daarbij vrij van de notch en de home-balk.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

// Runs before hydration so the correct theme's CSS variables are already
// active on first paint — without this, the page would briefly render the
// light theme and then flash to dark once React mounts and reads
// localStorage.
// Zonder eigen keuze volgt de app het thema van de telefoon.
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('sandhovius-theme');
    var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) {}
})();
`

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: themeInitScript zet data-theme bewust al
    // vóór hydration; dat verschil met de server-HTML is precies de
    // bedoeling (geldt alleen voor dit ene element, niet voor kinderen).
    <html lang="nl" className={urbanist.variable} suppressHydrationWarning>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
