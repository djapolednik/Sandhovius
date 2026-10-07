'use client'

import { useEffect } from 'react'

// De link in de uitnodigingsmail. De uitnodiging hoort bij je e-mailadres,
// niet bij de link: we gaan meteen naar de app. Daar log je in of maak je een
// account aan met dat adres, en staat de uitnodiging bovenaan Home.
export default function Page() {
  useEffect(() => {
    window.location.replace('/')
  }, [])
  return null
}
