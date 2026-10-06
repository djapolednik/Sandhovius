import PocketBase, { LocalAuthStore } from 'pocketbase'

// Waar PocketBase staat. Een ingestelde NEXT_PUBLIC_POCKETBASE_URL wint;
// anders de host van de pagina zelf op poort 8090, zodat de app zowel vanaf
// de laptop (localhost) als vanaf een telefoon op het LAN werkt. Op de server
// (geen window) is er geen adres: daar praat de app niet met PocketBase.
export function pocketbaseUrl(configured, location) {
  if (configured) return configured
  if (!location) return undefined
  return `${location.protocol}//${location.hostname}:8090`
}

export function defaultPocketbaseUrl() {
  return pocketbaseUrl(
    process.env.NEXT_PUBLIC_POCKETBASE_URL,
    typeof window !== 'undefined' ? window.location : undefined
  )
}

// Voor de losse pagina's (/bevestig, /wachtwoord): dezelfde auth-opslag als
// de hoofdapp in page.js, zodat een bevestiging de ingelogde sessie kan
// verversen.
export function createPb() {
  return new PocketBase(defaultPocketbaseUrl(), new LocalAuthStore('pocketbase_auth'))
}
