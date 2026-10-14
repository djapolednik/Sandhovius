import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isHome, memberName, othersLine } from './presence.js'
import { INTL } from './messages.testkit.js'

const { nl, en } = INTL
const members = [
  { id: 'me', name: 'Sanne', email: 's@x.nl' },
  { id: 'tom', name: 'Tom', email: 't@x.nl' },
  { id: 'kim', name: '', email: 'kim@x.nl' },
]

test('isHome: geen rij = thuis', () => {
  assert.equal(isHome([], 'me'), true)
  assert.equal(isHome([{ user: 'me', home: false }], 'me'), false)
  assert.equal(isHome([{ user: 'tom', home: false }], 'me'), true)
})

test('memberName: naam, anders e-mailadres', () => {
  assert.equal(memberName(members[0]), 'Sanne')
  assert.equal(memberName(members[2]), 'kim@x.nl')
})

test('othersLine: wie er verder thuis is, in beide talen', () => {
  const line = (rows, intl = nl) => othersLine(intl, { me: 'me', members, rows })
  assert.equal(line([]), 'Tom en kim@x.nl zijn ook thuis')
  assert.equal(line([], en), 'Tom and kim@x.nl are home too')
  assert.equal(line([{ user: 'kim', home: false }]), 'Tom is ook thuis')
  assert.equal(line([{ user: 'kim', home: false }], en), 'Tom is home too')
  assert.equal(line([{ user: 'kim', home: false }, { user: 'tom', home: false }]), 'Verder is niemand thuis')
  assert.equal(line([{ user: 'me', home: false }, { user: 'kim', home: false }]), 'Tom is thuis')
  assert.equal(line([{ user: 'me', home: false }, { user: 'kim', home: false }], en), 'Tom is home')
  assert.equal(
    line([{ user: 'me', home: false }, { user: 'kim', home: false }, { user: 'tom', home: false }]),
    'Niemand is thuis'
  )
  assert.equal(othersLine(nl, { me: 'me', members: [members[0]], rows: [] }), '')
})
