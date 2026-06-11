// Komplette Epic-Bibliothek (auch NICHT installierte Spiele) — braucht das
// verbundene Konto. Zwei Schritte, genau wie Legendary es macht:
//   1. library-service: WAS besitzt das Konto (nur IDs, seitenweise)
//   2. catalog-service: Metadaten dazu (Titel, Bilder, ist-es-ein-Spiel?)
// Die Katalog-Metadaten ändern sich praktisch nie -> Festplatten-Cache,
// damit nur der erste Abruf langsam ist.

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { EpicLibraryGame, EpicLibraryResult } from '@shared/types'
import { listPlatformPlaytimes } from '../../db'
import { getAccessToken } from './account'

const LIBRARY_ITEMS_URL =
  'https://library-service.live.use1a.on.epicgames.com/library/api/public/items'
const CATALOG_URL = (namespace: string): string =>
  `https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace/${namespace}/bulk/items`
const PLAYTIME_URL = (accountId: string): string =>
  `https://library-service.live.use1a.on.epicgames.com/library/api/public/playtime/account/${accountId}/all`

interface LibraryRecord {
  namespace: string
  catalogItemId: string
  appName?: string
  sandboxType?: string
}

interface CatalogEntry {
  title?: string
  categories?: { path?: string }[]
  keyImages?: { type: string; url: string }[]
  mainGameItem?: unknown // vorhanden = DLC/Zusatzinhalt
}

// --- Katalog-Cache (catalogItemId -> Metadaten) ------------------------------

interface CachedMeta {
  title: string | null
  coverUrl: string | null
  isGame: boolean
}

let catalogCache: Record<string, CachedMeta> | null = null

function cacheFile(): string {
  return join(app.getPath('userData'), 'epic-catalog-cache.json')
}

function loadCache(): Record<string, CachedMeta> {
  if (catalogCache) return catalogCache
  try {
    catalogCache = existsSync(cacheFile())
      ? (JSON.parse(readFileSync(cacheFile(), 'utf8')) as Record<string, CachedMeta>)
      : {}
  } catch {
    catalogCache = {}
  }
  return catalogCache
}

function saveCache(): void {
  if (catalogCache) {
    try {
      writeFileSync(cacheFile(), JSON.stringify(catalogCache))
    } catch {
      /* Cache ist nur Komfort */
    }
  }
}

// --- Abruf -------------------------------------------------------------------

/** Alle Bibliotheks-Einträge des Kontos einsammeln (seitenweise per Cursor). */
async function fetchAllRecords(token: string): Promise<LibraryRecord[]> {
  const records: LibraryRecord[] = []
  let cursor: string | null = null
  for (let page = 0; page < 50; page++) {
    const url =
      `${LIBRARY_ITEMS_URL}?includeMetadata=true` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '')
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`Bibliothek nicht abrufbar (HTTP ${res.status})`)
    const json = (await res.json()) as {
      records?: LibraryRecord[]
      responseMetadata?: { nextCursor?: string }
    }
    records.push(...(json.records ?? []))
    cursor = json.responseMetadata?.nextCursor ?? null
    if (!cursor) break
  }
  return records
}

function pickTallImage(images?: { type: string; url: string }[]): string | null {
  const order = ['DieselGameBoxTall', 'OfferImageTall', 'DieselGameBox', 'Thumbnail']
  for (const type of order) {
    const hit = images?.find((i) => i.type === type)
    if (hit) return hit.url
  }
  return null
}

/** Metadaten für fehlende Einträge nachladen — gebündelt pro Namespace. */
async function fillCatalogMeta(token: string, records: LibraryRecord[]): Promise<void> {
  const cache = loadCache()
  const missingByNs = new Map<string, string[]>()
  for (const r of records) {
    if (!cache[r.catalogItemId]) {
      const list = missingByNs.get(r.namespace) ?? []
      list.push(r.catalogItemId)
      missingByNs.set(r.namespace, list)
    }
  }
  if (missingByNs.size === 0) return

  const jobs = [...missingByNs.entries()].map(([ns, ids]) => async (): Promise<void> => {
    // Der Endpunkt nimmt mehrere ids auf einmal (id=a&id=b&…).
    const query = ids.map((id) => `id=${id}`).join('&')
    const res = await fetch(
      `${CATALOG_URL(ns)}?${query}&includeDLCDetails=false&includeMainGameDetails=false&country=DE&locale=de`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return // einzelner Namespace darf scheitern
    const json = (await res.json()) as Record<string, CatalogEntry>
    for (const id of ids) {
      const entry = json[id]
      // Spiel = Kategorie "games", aber kein Zusatzinhalt: DLCs haben die
      // Kategorie "addons" oder verweisen per mainGameItem aufs Hauptspiel.
      const paths = entry?.categories?.map((c) => c.path ?? '') ?? []
      const isBaseGame =
        paths.includes('games') &&
        !paths.some((p) => p.startsWith('addons') || p === 'digitalextras') &&
        !entry?.mainGameItem
      cache[id] = entry
        ? { title: entry.title ?? null, coverUrl: pickTallImage(entry.keyImages), isGame: isBaseGame }
        : { title: null, coverUrl: null, isGame: false }
    }
  })

  // Höflich parallel: 8 Namespaces gleichzeitig.
  for (let i = 0; i < jobs.length; i += 8) {
    await Promise.all(jobs.slice(i, i + 8).map((job) => job().catch(() => {})))
  }
  saveCache()
}

/** Die komplette Bibliothek: Titel, Cover, Spielzeit, installiert ja/nein. */
export async function getEpicLibrary(): Promise<EpicLibraryResult> {
  try {
    const { token, accountId } = await getAccessToken()
    const records = await fetchAllRecords(token)
    await fillCatalogMeta(token, records)
    const cache = loadCache()

    // Offizielle Epic-Spielzeiten (für alle Spiele, auch nicht installierte).
    const playRes = await fetch(PLAYTIME_URL(accountId), {
      headers: { Authorization: `Bearer ${token}` }
    })
    const playItems = playRes.ok
      ? ((await playRes.json()) as { artifactId: string; totalTime: number }[])
      : []
    const playtimeByApp = new Map(playItems.map((i) => [i.artifactId, i.totalTime]))

    const installed = new Set(listPlatformPlaytimes('epic').map((g) => g.platformId))

    const seen = new Set<string>()
    const games: EpicLibraryGame[] = []
    for (const r of records) {
      const meta = cache[r.catalogItemId]
      if (!meta?.isGame || !meta.title || !r.appName) continue
      if (seen.has(r.catalogItemId)) continue // doppelte Einträge (z. B. zwei Plattformen)
      seen.add(r.catalogItemId)
      games.push({
        title: meta.title,
        appName: r.appName,
        installed: installed.has(r.appName),
        playtimeSec: playtimeByApp.get(r.appName) ?? 0,
        coverUrl: meta.coverUrl
      })
    }

    // Installierte zuerst, dann nach Spielzeit, dann alphabetisch.
    games.sort(
      (a, b) =>
        Number(b.installed) - Number(a.installed) ||
        b.playtimeSec - a.playtimeSec ||
        a.title.localeCompare(b.title, 'de')
    )
    return { ok: true, games }
  } catch (err) {
    return { ok: false, games: [], error: String(err instanceof Error ? err.message : err) }
  }
}
