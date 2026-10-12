// Een uniek id voor iets dat alleen in de app leeft (een toast, een nieuwe
// schemaregel). crypto.randomUUID bestaat alleen op een beveiligde verbinding
// (HTTPS of localhost); een telefoon die de app via http://192.168… opent heeft
// hem niet, en dan crashte elke toast. Daar volstaat tijd + teller + toeval.
let counter = 0

export function uid(cryptoImpl = globalThis.crypto) {
  if (typeof cryptoImpl?.randomUUID === 'function') return cryptoImpl.randomUUID()
  counter += 1
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
