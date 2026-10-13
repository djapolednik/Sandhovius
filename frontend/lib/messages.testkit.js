// Alleen voor tests: de berichtenbestanden lezen en controleren of een
// sleutel in elke taal bestaat. Geen .test.js, zodat node --test hem niet
// zelf als test draait.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { LANGUAGES } from './language.js'

const dir = new URL('../messages/', import.meta.url)

export const MESSAGES = Object.fromEntries(
  LANGUAGES.map((language) => [language, JSON.parse(readFileSync(new URL(`${language}.json`, dir), 'utf8'))])
)

export function lookup(messages, key) {
  return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), messages)
}

// Een sleutel die een helper teruggeeft, moet in elke taal een tekst zijn.
export function assertMessage(key) {
  for (const language of LANGUAGES) {
    assert.equal(typeof lookup(MESSAGES[language], key), 'string', `${key} ontbreekt in ${language}.json`)
  }
}

// Alle sleutels van een (genest) berichtenbestand, als "a.b.c".
export function keysOf(node, prefix = '') {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'string' ? [prefix + key] : keysOf(value, `${prefix}${key}.`)
  )
}
