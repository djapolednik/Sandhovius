// Favorieten zijn per persoon: records { user, device, order } in de collectie
// "favorites" (de regels laten alleen je eigen favorieten zien). Thermostaten
// staan niet tussen de favorieten op Home.

export function favoriteFor(favorites, deviceId) {
  return favorites.find((f) => f.device === deviceId)
}

// De favoriete apparaten, op volgorde en dan op naam.
export function favoriteDevices(devices, favorites) {
  const order = new Map(favorites.map((f) => [f.device, f.order ?? 0]))
  return devices
    .filter((d) => order.has(d.id) && d.type !== 'climate')
    .sort((a, b) => order.get(a.id) - order.get(b.id) || a.name.localeCompare(b.name, 'nl'))
}

// Volgnummer voor een nieuwe favoriet: achteraan.
export function nextOrder(favorites) {
  return Math.max(0, ...favorites.map((f) => f.order ?? 0)) + 1
}
