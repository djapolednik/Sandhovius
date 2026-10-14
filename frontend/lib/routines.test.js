import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  OFF_AFTER_CHOICES,
  describeAutomation,
  describeStarter,
  missingStep,
  routineRecord,
  routineSensors,
  routineTitle,
  sensorEvents,
} from './routines.js'
import { INTL, assertMessage } from './messages.testkit.js'

const { nl, en } = INTL

const names = {
  devices: { door: 'Voordeur', hall: 'Ganglamp', kitchen: 'Keukenlamp', bath: 'Badkamer', a: 'A', b: 'B', c: 'C', d: 'D' },
  scenes: { evening: 'Avond' },
}

const routine = (starter, actions = [], extra = {}) => ({ starter, conditions: [], actions, off_after: 0, ...extra })
const on = (device, payload) => ({ kind: 'device', device, action: 'turn_on', ...(payload ? { payload } : {}) })
const off = (device) => ({ kind: 'device', device, action: 'turn_off' })

test('describeAutomation: het voorbeeld uit de spec, in beide talen', () => {
  const r = routine({ kind: 'sensor', device: 'door', event: 'open' }, [on('hall')], {
    conditions: [{ kind: 'dark' }],
    off_after: 5,
  })
  assert.equal(describeAutomation(nl, r, names), 'Als Voordeur opengaat, alleen als het donker is: Ganglamp aan, na 5 minuten weer uit.')
  assert.equal(describeAutomation(en, r, names), "When Voordeur opens, only when it's dark: Ganglamp on, off again after 5 minutes.")
})

test('describeStarter: elke soort', () => {
  const s = (starter) => [describeStarter(nl, starter, names), describeStarter(en, starter, names)]
  assert.deepEqual(s({ kind: 'time', time: '07:00', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] }), [
    'Elke dag om 07:00',
    'Every day at 07:00',
  ])
  assert.deepEqual(s({ kind: 'sun', event: 'sunset', offset_min: -30, days: ['sat', 'sun'] }), [
    'Weekend 30 minuten voor zonsondergang',
    'Weekend 30 minutes before sunset',
  ])
  assert.deepEqual(s({ kind: 'device', device: 'hall', to: 'off' }), ['Als Ganglamp uitgaat', 'When Ganglamp turns off'])
  assert.deepEqual(s({ kind: 'sensor', device: 'bath', event: 'no_motion' }), [
    'Als Badkamer geen beweging meer ziet',
    'When Badkamer stops detecting motion',
  ])
  assert.deepEqual(s({ kind: 'sensor', device: 'bath', event: 'above', value: 25 }), [
    'Als het bij Badkamer warmer wordt dan 25,0°',
    'When it gets warmer than 25.0° at Badkamer',
  ])
  assert.deepEqual(s({ kind: 'sensor', device: 'gone', event: 'leak' }), [
    'Als een apparaat dat weg is lekkage meldt',
    "When a device that's gone detects a leak",
  ])
  assert.deepEqual(s({ kind: 'sensor', device: 'bath' }), ['', ''])
})

test('describeAutomation: voorwaarden, scène, helderheid en meer dan drie stappen', () => {
  const r = routine({ kind: 'time', time: '22:30', days: ['mon', 'tue', 'wed', 'thu', 'fri'] }, [
    { kind: 'scene', scene: 'evening' },
    on('kitchen', { brightness_pct: 40 }),
  ], {
    conditions: [{ kind: 'between', from: '22:00', to: '06:00' }, { kind: 'days', days: ['wed', 'mon'] }],
  })
  assert.equal(
    describeAutomation(nl, r, names),
    'Werkdagen om 22:30, alleen tussen 22:00 en 06:00 en op maandag en woensdag: scène Avond en Keukenlamp aan (40%).'
  )
  assert.equal(
    describeAutomation(en, r, names),
    'Weekdays at 22:30, only between 22:00 and 06:00 and on Monday and Wednesday: scene Avond and Keukenlamp on (40%).'
  )
  const many = routine({ kind: 'device', device: 'hall', to: 'on' }, [on('a'), off('b'), on('c'), on('d')], {
    conditions: [{ kind: 'days', days: ['sat', 'sun'] }],
  })
  assert.equal(describeAutomation(nl, many, names), 'Als Ganglamp aangaat, alleen in het weekend: A aan, B uit en nog 2.')
  assert.equal(describeAutomation(en, many, names), 'When Ganglamp turns on, only at the weekend: A on, B off and 2 more.')
})

test('describeAutomation: een routine die nog niet af is', () => {
  assert.equal(describeAutomation(nl, routine({}), names), 'Als …: nog niets.')
  assert.equal(describeAutomation(en, routine({}), names), 'When …: nothing yet.')
})

test('routineTitle: de eigen naam, anders de starter', () => {
  assert.equal(routineTitle(nl, routine({ kind: 'device', device: 'hall', to: 'on' }), names), 'Als Ganglamp aangaat')
  assert.equal(routineTitle(nl, { ...routine({}), name: '  Thuiskomen ' }, names), 'Thuiskomen')
  assert.equal(routineTitle(en, routine({}), names), 'New routine')
})

test('missingStep: zegt per stap wat er mist', () => {
  const known = { devices: new Set(['door', 'hall']), scenes: new Set(['evening']) }
  const key = (r) => missingStep(r, known)?.key ?? null
  assert.equal(key(routine({})), 'routines.missing.starter')
  assert.equal(key(routine({ kind: 'sensor' })), 'routines.missing.sensor')
  assert.equal(key(routine({ kind: 'sensor', device: 'door' })), 'routines.missing.event')
  assert.equal(key(routine({ kind: 'sensor', device: 'door', event: 'above' })), 'routines.missing.temperature')
  assert.equal(key(routine({ kind: 'sensor', device: 'door', event: 'above', value: 41 })), 'routines.missing.temperature')
  assert.equal(key(routine({ kind: 'device' })), 'routines.missing.lamp')
  assert.equal(key(routine({ kind: 'time', time: '07:00', days: [] })), 'routines.missing.days')
  assert.equal(key(routine({ kind: 'sun', event: 'sunrise', days: [] })), 'routines.missing.days')
  const starter = { kind: 'sensor', device: 'door', event: 'open' }
  assert.equal(key(routine(starter)), 'routines.missing.action')
  assert.equal(key(routine(starter, [{ kind: 'device', action: 'turn_on' }])), 'routines.missing.target')
  assert.equal(key(routine(starter, [on('gone')])), 'routines.missing.target')
  assert.equal(key(routine(starter, [{ kind: 'scene', scene: 'gone' }])), 'routines.missing.target')
  assert.equal(
    key(routine(starter, [on('hall')], { conditions: [{ kind: 'between', from: '22:00', to: '22:00' }] })),
    'routines.missing.between'
  )
  assert.equal(missingStep(routine(starter, [on('hall')], { conditions: [{ kind: 'days', days: [] }] }), known).part, 'conditions')
  assert.equal(key(routine(starter, [on('hall'), { kind: 'scene', scene: 'evening' }])), null)
})

test('missingStep: elke sleutel bestaat in beide talen', () => {
  for (const k of ['starter', 'time', 'days', 'lamp', 'to', 'sensor', 'event', 'temperature', 'between', 'condition', 'action', 'target']) {
    assertMessage(`routines.missing.${k}`)
  }
})

test('routineRecord: alleen de velden die bij de soort horen', () => {
  const draft = {
    name: ' Gang ',
    starter: { kind: 'sensor', device: 'door', event: 'open', value: 20, time: '07:00', days: ['mon'], to: 'on' },
    conditions: [{ kind: 'dark', from: '22:00' }, { kind: 'between', from: '22:00', to: '06:00', days: [] }],
    actions: [{ kind: 'device', device: 'hall', action: 'turn_off', payload: { brightness_pct: 40 }, scene: 'x' }, { kind: 'scene', scene: 'evening', device: 'y' }],
    off_after: 5,
  }
  assert.deepEqual(routineRecord(draft), {
    name: 'Gang',
    starter: { kind: 'sensor', device: 'door', event: 'open' },
    conditions: [{ kind: 'dark' }, { kind: 'between', from: '22:00', to: '06:00' }],
    actions: [{ kind: 'device', device: 'hall', action: 'turn_off' }, { kind: 'scene', scene: 'evening' }],
    off_after: 5,
  })
  assert.deepEqual(routineRecord({ starter: { kind: 'sensor', device: 'bath', event: 'below', value: 18 }, actions: [on('hall', { brightness_pct: 40 })] }).starter, {
    kind: 'sensor', device: 'bath', event: 'below', value: 18,
  })
  assert.deepEqual(routineRecord({ starter: { kind: 'sun', event: 'sunset', days: ['mon'] }, actions: [] }).starter, {
    kind: 'sun', event: 'sunset', offset_min: 0, days: ['mon'],
  })
})

test('sensorEvents en routineSensors: naar wat de sensor kan', () => {
  const door = { id: 'door', name: 'Voordeur', type: 'sensor', capabilities: ['contact', 'battery'] }
  const climate = { id: 'c', name: 'Badkamer', type: 'sensor', capabilities: ['temperature', 'humidity'] }
  const lux = { id: 'l', name: 'Licht', type: 'sensor', capabilities: ['illuminance'] }
  const lamp = { id: 'h', name: 'Ganglamp', type: 'light', capabilities: ['occupancy'] }
  assert.deepEqual(sensorEvents(door), ['open', 'closed'])
  assert.deepEqual(sensorEvents(climate), ['above', 'below'])
  assert.deepEqual(sensorEvents({}), [])
  assert.deepEqual(routineSensors([door, lux, lamp, climate]).map((d) => d.id), ['c', 'door'])
})

test('OFF_AFTER_CHOICES: zoals de hook', () => {
  assert.deepEqual(OFF_AFTER_CHOICES, [0, 1, 5, 15, 30, 60])
})

test('thuis/weg: starters en voorwaarden in beide talen', () => {
  const people = { ...names, users: { sanne: 'Sanne' } }
  const r = (starter, conditions = []) => routine(starter, [on('hall')], { conditions })
  assert.equal(describeAutomation(nl, r({ kind: 'presence', event: 'all_away' }), people), 'Als iedereen weg is: Ganglamp aan.')
  assert.equal(describeAutomation(en, r({ kind: 'presence', event: 'first_home' }), people), 'When the first person gets home: Ganglamp on.')
  assert.equal(
    describeAutomation(nl, r({ kind: 'presence', event: 'arrives', user: 'sanne' }, [{ kind: 'presence', state: 'nobody_home' }]), people),
    'Als Sanne thuiskomt, alleen als niemand thuis is: Ganglamp aan.'
  )
  assert.equal(
    describeAutomation(en, r({ kind: 'presence', event: 'leaves', user: 'gone' }, [{ kind: 'presence', state: 'away', user: 'sanne' }]), people),
    "When someone who's no longer in the household leaves, only when Sanne is away: Ganglamp on."
  )
})

test('thuis/weg: wat mist en het record', () => {
  const key = (r) => missingStep(r)?.key ?? null
  assert.equal(key(routine({ kind: 'presence' }, [on('hall')])), 'routines.missing.presence')
  assert.equal(key(routine({ kind: 'presence', event: 'arrives' }, [on('hall')])), 'routines.missing.person')
  assert.equal(
    key(routine({ kind: 'presence', event: 'all_away' }, [on('hall')], { conditions: [{ kind: 'presence', state: 'home' }] })),
    'routines.missing.person'
  )
  assert.equal(key(routine({ kind: 'presence', event: 'all_away' }, [on('hall')])), null)
  const record = routineRecord({
    starter: { kind: 'presence', event: 'all_away', user: 'sanne' },
    conditions: [{ kind: 'presence', state: 'someone_home', user: 'x' }, { kind: 'presence', state: 'away', user: 'sanne' }],
    actions: [on('hall')],
  })
  assert.deepEqual(record.starter, { kind: 'presence', event: 'all_away' })
  assert.deepEqual(record.conditions, [{ kind: 'presence', state: 'someone_home' }, { kind: 'presence', state: 'away', user: 'sanne' }])
  for (const k of ['presence', 'person']) assertMessage(`routines.missing.${k}`)
})
