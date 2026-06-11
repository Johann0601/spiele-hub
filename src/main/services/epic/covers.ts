import { existsSync, readFileSync } from 'fs'

// Epics lokaler Katalog-Cache: Base64-kodiertes JSON mit allen Katalog-Einträgen
// des Launchers — inklusive der Cover-Bild-URLs (CDN). Keine Anmeldung nötig.
const CATCACHE = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Catalog\\catcache.bin'

interface CatalogKeyImage {
  type?: string
  url?: string
}

interface CatalogItem {
  id?: string
  keyImages?: CatalogKeyImage[]
}

/**
 * Liest Epics Katalog-Cache und liefert eine Zuordnung
 * CatalogItemId -> URL des Hochformat-Covers ("DieselGameBoxTall", 1200x1600).
 */
export function readEpicCoverMap(): Map<string, string> {
  const map = new Map<string, string>()
  if (!existsSync(CATCACHE)) return map
  try {
    const json = Buffer.from(readFileSync(CATCACHE, 'utf8'), 'base64').toString('utf8')
    const items = JSON.parse(json) as CatalogItem[]
    for (const item of items) {
      if (!item?.id || !Array.isArray(item.keyImages)) continue
      const tall =
        item.keyImages.find((k) => k.type === 'DieselGameBoxTall') ??
        item.keyImages.find((k) => k.type === 'OfferImageTall')
      if (tall?.url) map.set(String(item.id), String(tall.url))
    }
  } catch {
    // defekter/unerwarteter Cache -> einfach keine Cover
  }
  return map
}
