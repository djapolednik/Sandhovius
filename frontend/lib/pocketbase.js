import PocketBase, { LocalAuthStore } from 'pocketbase'

// Voor de losse pagina's (/bevestig, /wachtwoord): dezelfde auth-opslag als
// de hoofdapp in page.js, zodat een bevestiging de ingelogde sessie kan
// verversen.
export function createPb() {
  return new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL, new LocalAuthStore('pocketbase_auth'))
}
