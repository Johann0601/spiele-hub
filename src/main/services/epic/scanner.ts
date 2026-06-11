import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'

export interface RawEpicGame {
  appName: string // eindeutige Epic-ID, auch fürs Starten
  name: string
  installDir: string | null
  launchUrl: string
  catalogItemId: string | null // Schlüssel in Epics lokalem Katalog-Cache (für Cover)
}

// Epic legt für jedes installierte Spiel eine .item-Datei (JSON) hier ab.
const MANIFESTS_DIR = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'

/**
 * Liest Epics Manifeste und gibt die echten, startbaren Spiele zurück.
 * Add-ons/Tools (Kategorie ohne "games" oder ohne LaunchExecutable) werden ausgelassen.
 */
export function scanEpic(): RawEpicGame[] {
  if (!existsSync(MANIFESTS_DIR)) return []

  const games: RawEpicGame[] = []
  const seen = new Set<string>()

  for (const file of readdirSync(MANIFESTS_DIR)) {
    if (!file.toLowerCase().endsWith('.item')) continue
    try {
      const j = JSON.parse(readFileSync(join(MANIFESTS_DIR, file), 'utf8'))
      const categories: string[] = Array.isArray(j.AppCategories) ? j.AppCategories : []
      const launchExe: string = j.LaunchExecutable ?? ''
      // Nur echte Spiele: Kategorie "games" UND eine Start-Exe.
      if (!categories.includes('games') || !launchExe) continue

      const appName: string = j.AppName
      if (!appName || seen.has(appName)) continue
      seen.add(appName)

      // InstallLocation mischt manchmal / und \ — für den Prozess-Abgleich vereinheitlichen.
      const installLocation: string = String(j.InstallLocation ?? '').replace(/\//g, '\\')

      games.push({
        appName,
        name: j.DisplayName ?? appName,
        installDir: installLocation || null,
        // Epics eigenes Start-Protokoll — der Client übernimmt den Launch zuverlässig.
        launchUrl: `com.epicgames.launcher://apps/${appName}?action=launch&silent=true`,
        catalogItemId: j.CatalogItemId ? String(j.CatalogItemId) : null
      })
    } catch {
      // defektes Manifest -> überspringen
    }
  }

  return games
}
