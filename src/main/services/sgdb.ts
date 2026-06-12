// SteamGridDB-Anbindung: hochwertige Hochformat-Cover (600x900) für Spiele
// ALLER Plattformen — deutlich schöner als die Wikipedia-Logos. Braucht einen
// kostenlosen API-Key (steamgriddb.com -> Profil -> Preferences -> API).

import type { SgdbStatus } from '@shared/types'
import { listGamesWithWikiCover, setGameCover } from '../db'
import { getStoredKey, setStoredKey } from './keys'

const API = 'https://www.steamgriddb.com/api/v2'

function getSgdbKey(): string | null {
  return getStoredKey('sgdbApiKey')
}

export function sgdbStatus(): SgdbStatus {
  return { connected: getSgdbKey() !== null }
}

async function sgdbFetch(key: string, path: string): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10000)
  })
  if (res.status === 401) throw new Error('unauthorized')
  if (!res.ok) return null
  return res.json()
}

/** Hochformat-Cover (600x900) zu einem Spielnamen suchen. */
export async function sgdbCover(name: string): Promise<string | null> {
  const key = getSgdbKey()
  if (!key) return null
  try {
    const search = (await sgdbFetch(
      key,
      `/search/autocomplete/${encodeURIComponent(name)}`
    )) as { data?: { id: number }[] } | null
    const gameId = search?.data?.[0]?.id
    if (!gameId) return null

    const grids = (await sgdbFetch(
      key,
      `/grids/game/${gameId}?dimensions=600x900&types=static`
    )) as { data?: { url: string }[] } | null
    return grids?.data?.[0]?.url ?? null
  } catch {
    return null
  }
}

/**
 * Bestehende Wikipedia-Logo-Cover durch echte Box-Art ersetzen — läuft einmal,
 * wenn der Key hinterlegt wird. Gibt die Anzahl der verbesserten Cover zurück.
 */
export async function upgradeWikiCovers(platforms: string[]): Promise<number> {
  let upgraded = 0
  for (const game of listGamesWithWikiCover(platforms)) {
    const url = await sgdbCover(game.name)
    if (url) {
      setGameCover(game.platform, game.platformId, url)
      upgraded++
    }
  }
  return upgraded
}

/** Key prüfen (Probe-Anfrage) und bei Erfolg verschlüsselt speichern. */
export async function setSgdbKey(
  key: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cleaned = key.trim()
  if (cleaned.length < 16) {
    return { ok: false, error: 'Der Key sieht zu kurz aus — bitte den kompletten Wert einfügen.' }
  }
  try {
    const res = await fetch(`${API}/search/autocomplete/portal`, {
      headers: { Authorization: `Bearer ${cleaned}` },
      signal: AbortSignal.timeout(10000)
    })
    if (res.status === 401) return { ok: false, error: 'SteamGridDB hat den Key abgelehnt — bitte prüfen.' }
    if (!res.ok) return { ok: false, error: `SteamGridDB antwortet nicht (HTTP ${res.status}).` }
  } catch {
    return { ok: false, error: 'Keine Verbindung zu SteamGridDB möglich — bist du online?' }
  }
  setStoredKey('sgdbApiKey', cleaned)
  return { ok: true }
}

export function clearSgdbKey(): SgdbStatus {
  setStoredKey('sgdbApiKey', null)
  return sgdbStatus()
}
