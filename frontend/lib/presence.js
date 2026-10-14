// Thuis of weg (spec 2026-10-14-presence-design.md): één rij per lid per huis
// in presence. Geen rij = thuis, zoals de box het leest.
import { cachedFormat } from './language.js'

// rows: de presence-rijen van één huis.
export function isHome(rows, userId) {
  const row = rows.find((r) => r.user === userId)
  return row ? row.home : true
}

// Hoe een lid heet: de naam, anders het e-mailadres.
export const memberName = (member) => member?.name?.trim() || member?.email || ''

// De regel naast je eigen knop: wie er verder thuis is. Leeg als je alleen
// in het huis woont. members: [{ id, name, email }]. intl: { t, locale }.
export function othersLine({ t, locale }, { me, members, rows }) {
  const others = members.filter((m) => m.id !== me)
  if (others.length === 0) return ''
  const home = others.filter((m) => isHome(rows, m.id)).map(memberName)
  const names = cachedFormat(Intl.ListFormat, locale, { type: 'conjunction' }).format(home)
  if (isHome(rows, me)) {
    return home.length > 0 ? t('presence.alsoHome', { names, count: home.length }) : t('presence.nobodyElse')
  }
  return home.length > 0 ? t('presence.othersHome', { names, count: home.length }) : t('presence.nobodyHome')
}
