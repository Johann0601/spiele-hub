import { app, dialog, shell } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from 'fs'
import { basename, join } from 'path'
import {
  ensureWotMod,
  getWotInstallDir,
  getWotModById,
  listWotMods,
  setWotModEnabled
} from '../../db'
import type { WotMod, WotStatus } from '@shared/types'

/**
 * Konzept:
 *  - WoT legt Mods als .wotmod-Dateien in <spiel>\mods\<version>\ ab.
 *  - Bei jedem Spiel-Update entsteht ein NEUER Versionsordner — die Mods bleiben
 *    im alten zurück und sind damit "weg".
 *  - Die App führt deshalb eine eigene Mod-Bibliothek (Kopie jeder bekannten Mod
 *    im userData-Ordner). Aktivieren = Kopie in den aktuellen Versionsordner,
 *    Deaktivieren = dort löschen (Bibliothekskopie bleibt).
 *  - "Wiederherstellen" kopiert nach einem Spiel-Update alle aktiven Mods in den
 *    neuen Versionsordner.
 */

/** Bibliotheksordner der App (überlebt Spiel-Updates und Neuinstallationen). */
function libraryDir(): string {
  const dir = join(app.getPath('userData'), 'wot-mods')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Findet den echten Spielordner (Steam-Version: Unterordner "eu"). */
function resolveWotDir(): string | null {
  const base = getWotInstallDir()
  if (!base) return null
  for (const candidate of [base, join(base, 'eu')]) {
    if (existsSync(join(candidate, 'mods')) && existsSync(join(candidate, 'version.xml'))) {
      return candidate
    }
  }
  return null
}

/** Liest die Spielversion aus version.xml, z. B. "2.3.0.1". */
function readGameVersion(wotDir: string): string | null {
  try {
    const xml = readFileSync(join(wotDir, 'version.xml'), 'utf8')
    const m = /<version>\s*v\.?\s*([\d.]+)/i.exec(xml)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/** Alle Versionsordner unter mods\ (z. B. "2.3.0.0", "2.3.0.1"), neueste zuerst. */
function listVersionFolders(wotDir: string): string[] {
  const modsRoot = join(wotDir, 'mods')
  if (!existsSync(modsRoot)) return []
  return readdirSync(modsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d+(\.\d+)*$/.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => compareVersions(b, a))
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * Übernimmt alle .wotmod-Dateien aus sämtlichen Versionsordnern in die Bibliothek
 * (neueste Version gewinnt bei gleichem Dateinamen) und registriert sie in der DB.
 * So "adoptiert" die App auch Mods, die der Nutzer früher von Hand installiert hat.
 */
function importExistingMods(wotDir: string): void {
  const lib = libraryDir()
  for (const version of listVersionFolders(wotDir)) {
    const folder = join(wotDir, 'mods', version)
    for (const file of readdirSync(folder)) {
      if (!file.toLowerCase().endsWith('.wotmod')) continue
      const target = join(lib, file)
      if (!existsSync(target)) {
        try {
          copyFileSync(join(folder, file), target)
        } catch {
          continue
        }
      }
      ensureWotMod(file)
    }
  }
}

/** Der Ordner für die AKTUELLE Spielversion (wird bei Bedarf angelegt). */
function currentModsFolder(wotDir: string, version: string): string {
  const folder = join(wotDir, 'mods', version)
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true })
  return folder
}

/** Gesamtzustand fürs UI zusammenstellen. */
export function getWotStatus(): WotStatus {
  const fail = (error: string): WotStatus => ({
    ok: false,
    wotDir: null,
    currentVersion: null,
    mods: [],
    needsRestore: 0,
    error
  })

  const wotDir = resolveWotDir()
  if (!wotDir) return fail('World of Tanks wurde nicht gefunden (erst Spiele scannen?).')

  const version = readGameVersion(wotDir) ?? listVersionFolders(wotDir)[0] ?? null
  if (!version) return fail('Spielversion konnte nicht ermittelt werden.')

  importExistingMods(wotDir)

  const currentFolder = join(wotDir, 'mods', version)
  const lib = libraryDir()

  const mods: WotMod[] = listWotMods().map((row) => {
    const installedPath = join(currentFolder, row.fileName)
    const installed = existsSync(installedPath)
    let sizeBytes = 0
    try {
      sizeBytes = statSync(installed ? installedPath : join(lib, row.fileName)).size
    } catch {
      /* Datei fehlt -> 0 */
    }
    return {
      id: row.id,
      fileName: row.fileName,
      displayName: row.fileName.replace(/\.wotmod$/i, ''),
      enabled: row.enabled === 1,
      installed,
      sizeBytes
    }
  })

  return {
    ok: true,
    wotDir,
    currentVersion: version,
    mods,
    needsRestore: mods.filter((m) => m.enabled && !m.installed).length
  }
}

/** Mod aktivieren (in den aktuellen Versionsordner kopieren) oder deaktivieren (dort löschen). */
export function toggleWotMod(id: number, enable: boolean): WotStatus {
  const row = getWotModById(id)
  const wotDir = resolveWotDir()
  const version = wotDir ? (readGameVersion(wotDir) ?? listVersionFolders(wotDir)[0]) : null

  if (row && wotDir && version) {
    const target = join(currentModsFolder(wotDir, version), row.fileName)
    const source = join(libraryDir(), row.fileName)
    try {
      if (enable && existsSync(source)) copyFileSync(source, target)
      if (!enable && existsSync(target)) unlinkSync(target)
      setWotModEnabled(id, enable)
    } catch {
      /* Datei gesperrt (Spiel läuft?) -> Zustand unverändert lassen */
    }
  }
  return getWotStatus()
}

/** Stellt alle aktiven Mods im aktuellen Versionsordner wieder her (nach Spiel-Update). */
export function restoreWotMods(): WotStatus {
  const wotDir = resolveWotDir()
  const version = wotDir ? (readGameVersion(wotDir) ?? listVersionFolders(wotDir)[0]) : null
  if (wotDir && version) {
    const folder = currentModsFolder(wotDir, version)
    const lib = libraryDir()
    for (const row of listWotMods()) {
      if (row.enabled !== 1) continue
      const source = join(lib, row.fileName)
      const target = join(folder, row.fileName)
      if (existsSync(source) && !existsSync(target)) {
        try {
          copyFileSync(source, target)
        } catch {
          /* einzelne Datei fehlgeschlagen -> Rest trotzdem versuchen */
        }
      }
    }
  }
  return getWotStatus()
}

/** Neue Mods hinzufügen: Dateiauswahl -> Bibliothek + aktueller Versionsordner. */
export async function addWotMods(): Promise<WotStatus> {
  const wotDir = resolveWotDir()
  const version = wotDir ? (readGameVersion(wotDir) ?? listVersionFolders(wotDir)[0]) : null

  const result = await dialog.showOpenDialog({
    title: 'WoT-Mods auswählen (.wotmod)',
    filters: [{ name: 'WoT-Mods', extensions: ['wotmod'] }],
    properties: ['openFile', 'multiSelections']
  })

  if (!result.canceled && wotDir && version) {
    const folder = currentModsFolder(wotDir, version)
    const lib = libraryDir()
    for (const filePath of result.filePaths) {
      const file = basename(filePath)
      try {
        copyFileSync(filePath, join(lib, file)) // in die Bibliothek
        copyFileSync(filePath, join(folder, file)) // direkt aktivieren
        ensureWotMod(file)
      } catch {
        /* einzelne Datei fehlgeschlagen -> Rest trotzdem versuchen */
      }
    }
  }
  return getWotStatus()
}

/** Öffnet den aktuellen Mod-Ordner im Explorer. */
export function openWotModsFolder(): void {
  const wotDir = resolveWotDir()
  const version = wotDir ? (readGameVersion(wotDir) ?? listVersionFolders(wotDir)[0]) : null
  if (wotDir && version) shell.openPath(currentModsFolder(wotDir, version))
}
