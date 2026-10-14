// Koppelen in de app (spec 2026-10-14-device-pairing-design.md): eerst de
// soort, dan zoekt de box; wat hij vindt staat als candidate in PocketBase.
// De woorden staan in messages/*.json onder pairing.*.

export const PAIRING_KINDS = ['light', 'switch', 'sensor', 'climate']

// De uitleg om een apparaat in koppelstand te zetten; "hue" = de knop op de
// bridge.
export function instructionKey(kind) {
  return `pairing.instructions.${kind}`
}

// Wat de bewoner in de lijst ziet: nog bezig, gevonden, niet ondersteund of
// bezig met toevoegen. Verborgen (failed, een ander soort) en toegevoegd niet.
const VISIBLE = new Set(['interviewing', 'found', 'unsupported', 'adding'])

export function visibleCandidates(candidates) {
  return (candidates ?? [])
    .filter((c) => VISIBLE.has(c.status))
    .sort((a, b) => String(a.created).localeCompare(String(b.created)))
}

// Hoeveel seconden de sessie nog openstaat. PocketBase schrijft datums met
// een spatie in plaats van de "T".
export function secondsLeft(expires, nowMs = Date.now()) {
  const end = Date.parse(String(expires ?? '').replace(' ', 'T'))
  if (Number.isNaN(end)) return 0
  return Math.max(0, Math.ceil((end - nowMs) / 1000))
}

// Er staat al een sessie open in dit huis (de hook weigert een tweede). Is
// het je eigen, bijvoorbeeld omdat de app werd gesloten terwijl je zocht,
// dan neem je hem over (zelfde soort) of vervang je hem; van een ander niet.
export function openSessionChoice(open, userId, kind) {
  if (!open || open.created_by !== userId) return 'busy'
  return open.kind === kind ? 'resume' : 'replace'
}

// "Je 3 lampen zijn klaar": per soort als alles van één soort is.
export function doneLine({ t }, added) {
  const types = new Set(added.map((c) => c.type))
  const kind = types.size === 1 ? [...types][0] : 'mixed'
  return t(`pairing.done.${kind}`, { count: added.length })
}
