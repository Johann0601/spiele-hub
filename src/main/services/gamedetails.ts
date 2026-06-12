// Store-Infos & News zu einem Spiel — aus der öffentlichen Steam-Store-API
// (auf Deutsch, ohne Key). Für Nicht-Steam-Spiele wird die AppID per
// Namenssuche zugeordnet (viele Spiele sind auch auf Steam gelistet).
//
// Die Store-API ist streng ratenbegrenzt (~200 Anfragen / 5 min), darum
// landen alle Antworten in einem Festplatten-Cache mit langer Lebensdauer.

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { GameDetails, GameNewsItem } from '@shared/types'
import { getGameBasic } from '../db'
import { steamSearchAppId } from './steam/storesearch'

// --- Festplatten-Cache -------------------------------------------------------

interface CacheEntry {
  ts: number // Unix-Sekunden des Abrufs
  appId: number | null // null = kein Steam-Eintrag gefunden (negativ gecacht)
  details?: Omit<GameDetails, 'ok' | 'error'>
}

const TTL_FOUND = 7 * 24 * 3600 // gefundene Details: 7 Tage gültig
const TTL_NOT_FOUND = 24 * 3600 // "nicht auf Steam": nach 1 Tag erneut probieren

let cache: Record<string, CacheEntry> | undefined

function cacheFilePath(): string {
  return join(app.getPath('userData'), 'game-details-cache.json')
}

function loadCache(): Record<string, CacheEntry> {
  if (cache) return cache
  cache = {}
  try {
    if (existsSync(cacheFilePath())) {
      cache = JSON.parse(readFileSync(cacheFilePath(), 'utf8')) as Record<string, CacheEntry>
    }
  } catch {
    cache = {} // beschädigt -> einfach neu aufbauen
  }
  return cache
}

function saveCache(): void {
  try {
    writeFileSync(cacheFilePath(), JSON.stringify(loadCache()))
  } catch {
    /* Cache ist nur Komfort — Fehler ignorieren */
  }
}

function isFresh(entry: CacheEntry): boolean {
  const ttl = entry.appId === null ? TTL_NOT_FOUND : TTL_FOUND
  return Date.now() / 1000 - entry.ts < ttl
}

// --- Steam-Store-Abruf -------------------------------------------------------

interface AppDetailsData {
  short_description?: string
  genres?: { description: string }[]
  developers?: string[]
  publishers?: string[]
  release_date?: { date?: string }
  metacritic?: { score?: number }
  screenshots?: { path_full: string }[]
}

async function fetchAppDetails(appId: number): Promise<Omit<GameDetails, 'ok' | 'error'> | null> {
  const res = await fetch(
    `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=DE&l=german`,
    { signal: AbortSignal.timeout(10000) }
  )
  if (!res.ok) return null
  const json = (await res.json()) as Record<string, { success: boolean; data?: AppDetailsData }>
  const entry = json[String(appId)]
  if (!entry?.success || !entry.data) return null
  const d = entry.data
  return {
    appId,
    shortDescription: d.short_description || null,
    genres: (d.genres ?? []).map((g) => g.description).filter(Boolean),
    developers: d.developers ?? [],
    publishers: d.publishers ?? [],
    releaseDate: d.release_date?.date || null,
    metacritic: d.metacritic?.score ?? null,
    screenshots: (d.screenshots ?? []).map((s) => s.path_full).filter(Boolean).slice(0, 12),
    storeUrl: `https://store.steampowered.com/app/${appId}/`
  }
}

/** AppID eines Eintrags bestimmen: Steam-Spiele direkt, sonst per Namenssuche. */
async function resolveAppId(platform: string, platformId: string, name: string): Promise<number | null> {
  if (platform === 'steam') {
    const id = Number(platformId)
    return Number.isFinite(id) ? id : null
  }
  return steamSearchAppId(name)
}

const EMPTY: Omit<GameDetails, 'ok' | 'error'> = {
  appId: null,
  shortDescription: null,
  genres: [],
  developers: [],
  publishers: [],
  releaseDate: null,
  metacritic: null,
  screenshots: [],
  storeUrl: null
}

/** Store-Infos zu einem Spiel laden (mit Cache). */
export async function getGameDetails(gameId: number): Promise<GameDetails> {
  const game = getGameBasic(gameId)
  if (!game) return { ok: false, ...EMPTY, error: 'Spiel nicht gefunden.' }

  const key = `${game.platform}:${game.platformId}`
  const store = loadCache()
  const cached = store[key]
  if (cached && isFresh(cached)) {
    return { ok: true, ...EMPTY, appId: cached.appId, ...(cached.details ?? {}) }
  }

  try {
    const appId = await resolveAppId(game.platform, game.platformId, game.name)
    const details = appId !== null ? await fetchAppDetails(appId) : null
    store[key] = {
      ts: Math.floor(Date.now() / 1000),
      appId: details ? appId : null,
      details: details ?? undefined
    }
    saveCache()
    return { ok: true, ...EMPTY, ...(details ?? {}) }
  } catch {
    // offline o. ä. — alter Cache-Stand ist besser als nichts
    if (cached) return { ok: true, ...EMPTY, appId: cached.appId, ...(cached.details ?? {}) }
    return { ok: false, ...EMPTY, error: 'Store-Infos konnten nicht geladen werden.' }
  }
}

// --- News & Patchnotes -------------------------------------------------------

/** BBCode/HTML aus Steam-News grob entfernen -> lesbarer Fließtext. */
function cleanNewsText(raw: string): string {
  return raw
    .replace(/\[img\][^[]*\[\/img\]/gi, ' ') // Bilder samt URL raus
    .replace(/\[[^\]]{1,60}\]/g, ' ') // übrige BBCode-Tags
    .replace(/<[^>]+>/g, ' ') // HTML-Tags
    .replace(/https?:\/\/\S+/g, ' ') // nackte Links
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280)
}

interface NewsItemRaw {
  title: string
  url: string
  date: number
  feedlabel: string
  contents: string
}

/** Aktuelle News/Patchnotes zu einem Spiel (über die zugeordnete AppID). */
export async function getGameNews(gameId: number): Promise<GameNewsItem[]> {
  // getGameDetails kümmert sich um AppID-Zuordnung + Cache.
  const details = await getGameDetails(gameId)
  if (!details.appId) return []

  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${details.appId}&count=8&maxlength=800`,
      { signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) return []
    const json = (await res.json()) as { appnews?: { newsitems?: NewsItemRaw[] } }
    return (json.appnews?.newsitems ?? [])
      .filter((n) => n.title && n.url)
      .map((n) => ({
        title: n.title,
        url: n.url,
        date: n.date,
        feedLabel: n.feedlabel || 'Steam',
        excerpt: cleanNewsText(n.contents || '')
      }))
  } catch {
    return []
  }
}
