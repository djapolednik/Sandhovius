import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pocketbaseUrl } from './pocketbase.js'

test('pocketbaseUrl gebruikt de ingestelde URL als die er is', () => {
  assert.equal(pocketbaseUrl('http://pb.test', { protocol: 'https:', hostname: 'app.test' }), 'http://pb.test')
})

test('pocketbaseUrl valt terug op de host van de pagina, poort 8090', () => {
  assert.equal(pocketbaseUrl(undefined, { protocol: 'http:', hostname: '192.168.1.20' }), 'http://192.168.1.20:8090')
})

test('pocketbaseUrl zonder window (server) geeft undefined', () => {
  assert.equal(pocketbaseUrl(undefined, undefined), undefined)
})
