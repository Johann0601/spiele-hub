// Online-Cover für Spiele ohne lokale Bilder (Battle.net, Ubisoft, Riot, RSI).
// Quellen in fester Reihenfolge:
//   1. kuratierte Liste (bekannte Spiele -> feste, stabile URL)
//   2. SteamGridDB (beste Box-Art — nur wenn ein API-Key hinterlegt ist)
//   3. öffentliche Steam-Store-Suche nach dem Namen (viele Spiele sind auch
//      auf Steam gelistet -> deren Hochformat-Cover)
//   4. Wikipedia-Titelbild des Artikels (deckt Nicht-Steam-Spiele ab)
// Gefundene URLs landen in der DB; Fehlversuche werden pro Sitzung gemerkt.

import { listGamesWithoutCover, setGameCover } from '../db'
import { sgdbCover } from './sgdb'
import { steamSearchAppId } from './steam/storesearch'

export const COVER_PLATFORMS = ['battlenet', 'ubisoft', 'riot', 'rsi']

/** Kuratierte Cover: "<platform>:<platformId>" -> URL. */
const CURATED: Record<string, string> = {
  // Call of Duty (HQ) ist auf Steam gelistet -> deren CDN-Cover.
  'battlenet:AUKS': 'https://cdn.cloudflare.steamstatic.com/steam/apps/1938090/library_600x900.jpg'
}

/** Wikipedia-Artikel für Spiele, deren Name allein nicht eindeutig genug ist. */
const WIKI_TITLE: Record<string, string> = {
  'battlenet:WTCG': 'Hearthstone',
  'battlenet:WoW': 'World of Warcraft',
  'rsi:starcitizen-live': 'Star Citizen'
}

// Bereits versuchte Spiele in dieser Sitzung (auch erfolglose) — verhindert,
// dass jeder 10-Minuten-Scan dieselben Anfragen wiederholt.
const attempted = new Set<string>()

async function fetchOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) })
    return res.ok
  } catch {
    return false
  }
}

/** Steam-Store-Suche: Name -> Hochformat-Cover (wenn das Spiel dort existiert). */
async function steamSearchCover(name: string): Promise<string | null> {
  const appId = await steamSearchAppId(name)
  if (!appId) return null
  const cover = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`
  return (await fetchOk(cover)) ? cover : null
}

/** Wikipedia-Titelbild (Infobox-Bild) des Artikels. */
async function wikipediaCover(title: string): Promise<string | null> {
  try {
    // pilicense=any: auch "fair use"-Bilder (Spiele-Cover/-Logos) zulassen.
    const res = await fetch(
      'https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=thumbnail&pithumbsize=600&pilicense=any&redirects=1&titles=' +
        encodeURIComponent(title),
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    const json = (await res.json()) as {
      query?: { pages?: Record<string, { thumbnail?: { source?: string } }> }
    }
    for (const page of Object.values(json.query?.pages ?? {})) {
      if (page.thumbnail?.source) return page.thumbnail.source
    }
    return null
  } catch {
    return null
  }
}

/** Fehlende Cover online suchen und in der DB hinterlegen. */
export async function resolveMissingCovers(): Promise<number> {
  let found = 0
  for (const game of listGamesWithoutCover(COVER_PLATFORMS)) {
    const key = `${game.platform}:${game.platformId}`
    if (attempted.has(key)) continue
    attempted.add(key)

    let url: string | null = CURATED[key] ?? null
    if (!url) url = await sgdbCover(game.name) // tut nichts ohne Key
    if (!url) url = await steamSearchCover(game.name)
    if (!url) url = await wikipediaCover(WIKI_TITLE[key] ?? game.name)

    if (url) {
      setGameCover(game.platform, game.platformId, url)
      found++
    }
  }
  return found
}
