export const metadata = {
  title: 'Sandhovius',
  description: 'Sandhovius smart home PWA',
}

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  )
}
