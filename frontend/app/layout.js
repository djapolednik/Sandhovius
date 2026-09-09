import Script from 'next/script'
import './globals.css'
import { ThemeProvider } from './ThemeContext'

export const metadata = {
  title: 'Sandhovius',
  description: 'Sandhovius smart home PWA',
}

// Runs before hydration so the correct theme's CSS variables are already
// active on first paint — without this, the page would briefly render the
// light theme and then flash to dark once React mounts and reads
// localStorage.
const themeInitScript = `
(function() {
  try {
    if (localStorage.getItem('sandhovius-theme') === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {}
})();
`

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
