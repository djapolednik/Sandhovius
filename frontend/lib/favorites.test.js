import { test } from 'node:test'
import assert from 'node:assert/strict'
import { favoriteDevices, favoriteFor, nextOrder } from './favorites.js'

const dev = (id, name, type = 'light') => ({ id, name, type })
const fav = (device, order) => ({ id: 'f' + device, device, order })

test('favoriteDevices: op volgorde, dan op naam, zonder thermostaten', () => {
  const devices = [dev('a', 'Zolder'), dev('b', 'Bank'), dev('c', 'Aanrecht'), dev('t', 'Thermostaat', 'climate'), dev('x', 'Geen favoriet')]
  const favorites = [fav('a', 2), fav('b', 1), fav('c', 2), fav('t', 0)]
  assert.deepEqual(favoriteDevices(devices, favorites).map((d) => d.id), ['b', 'c', 'a'])
})

test('favoriteDevices: favoriet van een onbekend apparaat telt niet', () => {
  assert.deepEqual(favoriteDevices([dev('a', 'Lamp')], [fav('weg', 1)]), [])
  assert.deepEqual(favoriteDevices([dev('a', 'Lamp')], []), [])
})

test('favoriteFor: vindt de favoriet van een apparaat', () => {
  const favorites = [fav('a', 1), fav('b', 2)]
  assert.equal(favoriteFor(favorites, 'b').id, 'fb')
  assert.equal(favoriteFor(favorites, 'c'), undefined)
})

test('nextOrder: hoogste plus één, 1 bij leeg', () => {
  assert.equal(nextOrder([]), 1)
  assert.equal(nextOrder([{ order: 3 }, { order: 1 }]), 4)
})
