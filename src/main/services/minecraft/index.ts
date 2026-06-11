import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import type { McProfile } from '@shared/types'

/**
 * Phase 5: Liest die Minecraft-Profile/Modpacks der drei Launcher — NUR lesend:
 *  - Modrinth:   SQLite-DB  %APPDATA%\ModrinthApp\app.db (Tabelle profiles)
 *  - CurseForge: JSON       %USERPROFILE%\curseforge\minecraft\Instances\*\minecraftinstance.json
 *  - FTB App:    JSON       %LOCALAPPDATA%\.ftba\instances\*\instance.json
 */

/** Zählt die .jar-Dateien im mods-Ordner einer Instanz. */
function countMods(instanceDir: string): number | null {
  const modsDir = join(instanceDir, 'mods')
  if (!existsSync(modsDir)) return null
  try {
    return readdirSync(modsDir).filter((f) => f.toLowerCase().endsWith('.jar')).length
  } catch {
    return null
  }
}

/** Liest eine kleine Bilddatei als data:-URL (für Profil-Icons). */
function fileToDataUrl(filePath: string | null): string | null {
  if (!filePath || !existsSync(filePath)) return null
  try {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? 'png'
    const mime = ext === 'webp' ? 'image/webp' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
    return `data:${mime};base64,${readFileSync(filePath).toString('base64')}`
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------

function readModrinth(): McProfile[] {
  const base = join(process.env.APPDATA ?? '', 'ModrinthApp')
  const dbPath = join(base, 'app.db')
  if (!existsSync(dbPath)) return []

  const profiles: McProfile[] = []
  let db: Database.Database | null = null
  try {
    // Nur lesend öffnen — die Modrinth App darf parallel laufen (WAL).
    db = new Database(dbPath, { readonly: true, fileMustExist: true })
    const rows = db
      .prepare(
        `SELECT path, name, game_version, mod_loader, mod_loader_version, icon_path,
                last_played, submitted_time_played, recent_time_played
         FROM profiles WHERE install_stage = 'installed'`
      )
      .all() as {
      path: string
      name: string
      game_version: string | null
      mod_loader: string | null
      mod_loader_version: string | null
      icon_path: string | null
      last_played: number | null
      submitted_time_played: number | null
      recent_time_played: number | null
    }[]

    for (const r of rows) {
      const instancePath = join(base, 'profiles', r.path)
      const playtime = (r.submitted_time_played ?? 0) + (r.recent_time_played ?? 0)
      profiles.push({
        launcher: 'modrinth',
        name: r.name,
        mcVersion: r.game_version,
        modLoader: r.mod_loader
          ? `${r.mod_loader}${r.mod_loader_version ? ' ' + r.mod_loader_version : ''}`
          : null,
        modCount: countMods(instancePath),
        lastPlayed: r.last_played || null,
        playtimeSec: playtime > 0 ? playtime : null,
        iconUrl: fileToDataUrl(r.icon_path),
        instancePath
      })
    }
  } catch {
    // DB gesperrt/Format geändert -> Modrinth einfach auslassen
  } finally {
    db?.close()
  }
  return profiles
}

function readCurseForge(): McProfile[] {
  const instancesDir = join(process.env.USERPROFILE ?? '', 'curseforge', 'minecraft', 'Instances')
  if (!existsSync(instancesDir)) return []

  const profiles: McProfile[] = []
  for (const dir of readdirSync(instancesDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const instancePath = join(instancesDir, dir.name)
    const manifest = join(instancePath, 'minecraftinstance.json')
    if (!existsSync(manifest)) continue
    try {
      const j = JSON.parse(readFileSync(manifest, 'utf8'))
      const lastPlayedIso: string | undefined = j.lastPlayed
      const thumbnail: string | undefined = j.installedModpack?.thumbnailUrl
      profiles.push({
        launcher: 'curseforge',
        name: j.name ?? dir.name,
        mcVersion: j.gameVersion ?? null,
        modLoader: j.baseModLoader?.name ?? null,
        modCount: Array.isArray(j.installedAddons) ? j.installedAddons.length : countMods(instancePath),
        lastPlayed: lastPlayedIso ? Math.floor(Date.parse(lastPlayedIso) / 1000) || null : null,
        playtimeSec: null, // CurseForge speichert keine Spielzeit
        iconUrl: thumbnail && thumbnail.startsWith('http') ? thumbnail : null,
        instancePath
      })
    } catch {
      // defekte Instanz -> überspringen
    }
  }
  return profiles
}

function readFtb(): McProfile[] {
  const instancesDir = join(process.env.LOCALAPPDATA ?? '', '.ftba', 'instances')
  if (!existsSync(instancesDir)) return []

  const profiles: McProfile[] = []
  for (const dir of readdirSync(instancesDir, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name.startsWith('.')) continue
    const instancePath = join(instancesDir, dir.name)
    const manifest = join(instancePath, 'instance.json')
    if (!existsSync(manifest)) continue
    try {
      const j = JSON.parse(readFileSync(manifest, 'utf8'))
      profiles.push({
        launcher: 'ftb',
        name: j.name ?? dir.name,
        mcVersion: j.mcVersion ?? null,
        modLoader: j.modLoader ?? null,
        modCount: countMods(instancePath),
        lastPlayed: j.lastPlayed || null, // bereits Unix-Sekunden
        playtimeSec: j.totalPlayTime ? Math.floor(j.totalPlayTime / 1000) : null, // ms -> s
        iconUrl: fileToDataUrl(join(instancePath, 'folder.jpg')),
        instancePath
      })
    } catch {
      // defekte Instanz -> überspringen
    }
  }
  return profiles
}

/** Alle Profile aller drei Launcher, zuletzt gespielte zuerst. */
export function listMcProfiles(): McProfile[] {
  return [...readModrinth(), ...readCurseForge(), ...readFtb()].sort(
    (a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0)
  )
}
