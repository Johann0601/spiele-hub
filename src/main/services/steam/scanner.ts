import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { parseVdf, getNode, getStr } from './vdf'
import { readImageSize } from './imageSize'

/** Ein roh eingelesenes Steam-Spiel, bevor es in der DB landet. */
export interface RawSteamGame {
  appid: string
  name: string
  installDir: string | null // absoluter Pfad zum Spielordner
  coverPath: string | null // absoluter Pfad zum lokalen Cover-Bild
  playtimeMinutes: number // gesammelte Spielzeit laut Steam
  lastPlayed: number | null // Unix-Zeit (Sekunden)
  buildId: string | null // Steam-Build-Nummer — ändert sich mit jedem Update
  updatePending: boolean // StateFlags Bit 2 = "Update erforderlich"
  manifestLastUpdated: number | null // "LastUpdated" aus dem Manifest (Unix-Sek.)
}

export interface SteamScan {
  steamPath: string | null
  libraries: string[]
  games: RawSteamGame[]
}

// AppIDs, die keine "echten" Spiele sind (Tools/Redistributables) und nicht ins Grid sollen.
const IGNORED_APPIDS = new Set(['228980']) // Steamworks Common Redistributables

/**
 * Findet den Steam-Installationsordner.
 * Reihenfolge: Windows-Registry (zuverlässigste Quelle) -> übliche Standardpfade.
 */
export function resolveSteamPath(): string | null {
  const candidates: string[] = []

  // 1) Registry: HKCU\Software\Valve\Steam\SteamPath
  try {
    const out = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const m = out.match(/SteamPath\s+REG_SZ\s+(.+)/i)
    if (m) candidates.push(m[1].trim().replace(/\//g, '\\'))
  } catch {
    // Registry-Eintrag nicht vorhanden -> ignorieren, Standardpfade probieren
  }

  // 2) Übliche Standardpfade
  candidates.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam')

  for (const c of candidates) {
    if (c && (existsSync(join(c, 'steam.exe')) || existsSync(join(c, 'steamapps')))) {
      return c
    }
  }
  return null
}

/**
 * Liest libraryfolders.vdf und gibt alle Bibliotheks-Pfade zurück
 * (also auch Spiele auf anderen Laufwerken wie D:\STEAMLIBRARY).
 */
export function getLibraryFolders(steamPath: string): string[] {
  const libraries = new Set<string>()
  libraries.add(steamPath) // der Hauptordner ist immer auch eine Bibliothek

  const candidates = [
    join(steamPath, 'steamapps', 'libraryfolders.vdf'),
    join(steamPath, 'config', 'libraryfolders.vdf')
  ]

  for (const file of candidates) {
    if (!existsSync(file)) continue
    try {
      const parsed = parseVdf(readFileSync(file, 'utf8'))
      const root = getNode(parsed, 'libraryfolders')
      if (!root) continue
      for (const key of Object.keys(root)) {
        const entry = root[key]
        if (typeof entry === 'object') {
          const path = getStr(entry, 'path')
          if (path) libraries.add(path)
        }
      }
      break // erste gefundene Datei reicht
    } catch {
      // defekte Datei -> überspringen
    }
  }

  return [...libraries]
}

/** Liest alle appmanifest_*.acf einer Bibliothek = installierte Spiele dort. */
function scanLibrary(libraryPath: string): Omit<RawSteamGame, 'coverPath' | 'playtimeMinutes' | 'lastPlayed'>[] {
  const steamapps = join(libraryPath, 'steamapps')
  if (!existsSync(steamapps)) return []

  const games: Omit<RawSteamGame, 'coverPath' | 'playtimeMinutes' | 'lastPlayed'>[] = []
  for (const file of readdirSync(steamapps)) {
    if (!/^appmanifest_\d+\.acf$/i.test(file)) continue
    try {
      const parsed = parseVdf(readFileSync(join(steamapps, file), 'utf8'))
      const app = getNode(parsed, 'AppState')
      if (!app) continue

      const appid = getStr(app, 'appid')
      const name = getStr(app, 'name')
      const installdir = getStr(app, 'installdir')
      if (!appid || !name) continue
      if (IGNORED_APPIDS.has(appid)) continue

      // Update-Infos: StateFlags Bit 2 = "Update erforderlich" (4 = aktuell, 6 = 4+2).
      const stateFlags = parseInt(getStr(app, 'StateFlags') ?? '0', 10) || 0
      const lastUpdated = parseInt(getStr(app, 'LastUpdated') ?? '0', 10) || 0

      games.push({
        appid,
        name,
        installDir: installdir ? join(steamapps, 'common', installdir) : null,
        buildId: getStr(app, 'buildid') ?? null,
        updatePending: (stateFlags & 2) !== 0,
        manifestLastUpdated: lastUpdated > 0 ? lastUpdated : null
      })
    } catch {
      // defektes Manifest -> überspringen
    }
  }
  return games
}

/**
 * Sucht das lokal von Steam zwischengespeicherte Cover-Bild zu einer AppID.
 * Steam legt diese unter appcache\librarycache ab (Layout variiert je nach Version).
 * Bevorzugt das hochformatige 600x900-Cover (ideal fürs Grid), sonst den Header.
 */
// Sammelt rekursiv alle Dateien unter einem Ordner (begrenzte Tiefe).
function collectFiles(dir: string, depth: number, out: string[]): void {
  if (depth < 0 || !existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(full, depth - 1, out)
    else out.push(full)
  }
}

function resolveCoverPath(steamPath: string, appid: string): string | null {
  const base = join(steamPath, 'appcache', 'librarycache')
  const appDir = join(base, appid)

  // Älteres Layout: <appid>_library_600x900.jpg direkt im Cache-Wurzelordner.
  const flat = join(base, `${appid}_library_600x900.jpg`)
  if (existsSync(flat)) return flat

  // Alle Bilder im AppID-Ordner einsammeln — inkl. der Hash-Unterordner, in denen
  // das neueste Steam die Dateien ablegt (Tiefe 2 reicht).
  const files: string[] = []
  collectFiles(appDir, 2, files)

  // 1) Bekannte Hochformat-Cover-Namen bevorzugen (eindeutig, ohne Messen).
  //    library_600x900 = altes Layout, library_capsule = neues Layout (300x450).
  const preferred = ['library_600x900.jpg', 'library_capsule.jpg']
  for (const name of preferred) {
    const hit = files.find((f) => f.toLowerCase().endsWith('\\' + name))
    if (hit) return hit
  }

  // 2) Fallback: jedes Bild messen und das im Hochformat (~2:3) mit größter Fläche nehmen.
  let best: { path: string; area: number } | null = null
  for (const full of files) {
    const size = readImageSize(full)
    if (!size || size.width < 200) continue
    const ratio = size.height / size.width
    if (ratio < 1.3 || ratio > 1.7) continue
    const area = size.width * size.height
    if (!best || area > best.area) best = { path: full, area }
  }
  return best?.path ?? null
}

// Konstante zur Umrechnung SteamID64 <-> Profil-Ordner-ID (32-bit AccountID).
const STEAMID64_BASE = 76561197960265728n

/**
 * Ermittelt die Profil-Ordner-ID des ZULETZT ANGEMELDETEN Steam-Kontos
 * (aus config\loginusers.vdf, Eintrag mit MostRecent=1 bzw. neuestem Timestamp).
 * Wichtig, weil mehrere Profile je Spiel unterschiedliche Spielzeiten haben.
 */
function getPrimaryAccountId(steamPath: string): string | null {
  const file = join(steamPath, 'config', 'loginusers.vdf')
  if (!existsSync(file)) return null
  try {
    const users = getNode(parseVdf(readFileSync(file, 'utf8')), 'users')
    if (!users) return null

    let bestId64: string | null = null
    let bestTimestamp = -1
    for (const id64 of Object.keys(users)) {
      const entry = users[id64]
      if (typeof entry !== 'object') continue
      const mostRecent = getStr(entry, 'MostRecent') === '1'
      const timestamp = parseInt(getStr(entry, 'Timestamp') ?? '0', 10) || 0
      // MostRecent gewinnt immer; sonst der mit dem neuesten Timestamp.
      if (mostRecent) return steamId64ToAccountId(id64)
      if (timestamp > bestTimestamp) {
        bestTimestamp = timestamp
        bestId64 = id64
      }
    }
    return bestId64 ? steamId64ToAccountId(bestId64) : null
  } catch {
    return null
  }
}

function steamId64ToAccountId(id64: string): string | null {
  try {
    return (BigInt(id64) - STEAMID64_BASE).toString()
  } catch {
    return null
  }
}

/** Liest die apps-Spielzeiten aus EINER localconfig.vdf. "Playtime" ist in MINUTEN. */
function readPlaytimeFile(
  cfgPath: string,
  out: Map<string, { minutes: number; lastPlayed: number }>
): void {
  if (!existsSync(cfgPath)) return
  try {
    const parsed = parseVdf(readFileSync(cfgPath, 'utf8'))
    // Pfad: UserLocalConfigStore > Software > Valve > Steam > apps
    const apps = getNode(
      getNode(getNode(getNode(getNode(parsed, 'UserLocalConfigStore'), 'Software'), 'Valve'), 'Steam'),
      'apps'
    )
    if (!apps) return
    for (const appid of Object.keys(apps)) {
      const entry = apps[appid]
      if (typeof entry !== 'object') continue
      const minutes = parseInt(getStr(entry, 'Playtime') ?? '0', 10) || 0
      const lastPlayed = parseInt(getStr(entry, 'LastPlayed') ?? '0', 10) || 0
      // Bei Fallback (mehrere Profile) das zuletzt gespielte gewinnen lassen.
      const prev = out.get(appid)
      if (!prev || lastPlayed > prev.lastPlayed) out.set(appid, { minutes, lastPlayed })
    }
  } catch {
    // defekte Datei -> überspringen
  }
}

/**
 * Liest die gesammelte Spielzeit pro Spiel. Bevorzugt NUR das zuletzt angemeldete
 * Profil (korrekt). Findet sich keines, fällt es auf "alle Profile, je Spiel das
 * zuletzt gespielte" zurück.
 */
function readPlaytimes(steamPath: string): Map<string, { minutes: number; lastPlayed: number }> {
  const result = new Map<string, { minutes: number; lastPlayed: number }>()
  const userdata = join(steamPath, 'userdata')
  if (!existsSync(userdata)) return result

  const primary = getPrimaryAccountId(steamPath)
  if (primary && existsSync(join(userdata, primary))) {
    readPlaytimeFile(join(userdata, primary, 'config', 'localconfig.vdf'), result)
    return result
  }

  // Fallback: kein eindeutiges Profil bestimmbar -> alle durchgehen.
  for (const accountId of readdirSync(userdata)) {
    readPlaytimeFile(join(userdata, accountId, 'config', 'localconfig.vdf'), result)
  }
  return result
}

/** Führt den kompletten Scan aus und liefert alle gefundenen Steam-Spiele. */
export function scanSteam(): SteamScan {
  const steamPath = resolveSteamPath()
  if (!steamPath) {
    return { steamPath: null, libraries: [], games: [] }
  }

  const libraries = getLibraryFolders(steamPath)
  const playtimes = readPlaytimes(steamPath)

  const games: RawSteamGame[] = []
  const seen = new Set<string>()
  for (const lib of libraries) {
    for (const base of scanLibrary(lib)) {
      if (seen.has(base.appid)) continue // dasselbe Spiel nicht doppelt
      seen.add(base.appid)
      const pt = playtimes.get(base.appid)
      games.push({
        ...base,
        coverPath: resolveCoverPath(steamPath, base.appid),
        playtimeMinutes: pt?.minutes ?? 0,
        lastPlayed: pt && pt.lastPlayed > 0 ? pt.lastPlayed : null
      })
    }
  }

  return { steamPath, libraries, games }
}
