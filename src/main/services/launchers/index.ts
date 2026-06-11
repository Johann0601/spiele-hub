import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { upsertGame } from '../../db'
import { resolveSteamPath } from '../steam/scanner'
import type { Platform } from '@shared/types'

interface LauncherDef {
  platform: Platform
  name: string
  candidates: string[] // mögliche exe-Pfade, erster Treffer gewinnt
}

function launcherDefs(): LauncherDef[] {
  const localApp = process.env.LOCALAPPDATA ?? ''
  const steamPath = resolveSteamPath()
  return [
    {
      platform: 'steam',
      name: 'Steam',
      candidates: [
        ...(steamPath ? [join(steamPath, 'steam.exe')] : []),
        'C:\\Program Files (x86)\\Steam\\steam.exe',
        'C:\\Program Files\\Steam\\steam.exe'
      ]
    },
    {
      platform: 'epic',
      name: 'Epic Games',
      candidates: [
        'C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe',
        'C:\\Program Files\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe'
      ]
    },
    {
      platform: 'modrinth',
      name: 'Modrinth',
      candidates: [
        `${localApp}\\Modrinth App\\theseus_gui.exe`,
        `${localApp}\\Programs\\Modrinth App\\Modrinth App.exe`
      ]
    },
    {
      platform: 'curseforge',
      name: 'CurseForge',
      candidates: [
        `${localApp}\\Programs\\CurseForge Windows\\CurseForge.exe`,
        `${localApp}\\Programs\\CurseForge\\CurseForge.exe`
      ]
    },
    {
      platform: 'ftb',
      name: 'FTB App',
      candidates: [`${localApp}\\Programs\\ftb-app\\FTB Electron App.exe`]
    }
  ]
}

/**
 * Erkennt installierte Launcher und speichert sie als startbare Einträge (kind='launcher').
 * Das echte Programm-Icon wird als data:-URL gespeichert und direkt angezeigt.
 */
export async function persistLaunchers(): Promise<number> {
  let count = 0
  for (const def of launcherDefs()) {
    const exe = def.candidates.find((c) => c && existsSync(c))
    if (!exe) continue // nicht installiert -> überspringen

    let iconDataUrl: string | null = null
    try {
      const icon = await app.getFileIcon(exe, { size: 'large' })
      if (!icon.isEmpty()) iconDataUrl = icon.toDataURL()
    } catch {
      // kein Icon -> Buchstaben-Platzhalter
    }

    upsertGame({
      platform: def.platform,
      platformId: 'launcher', // pro Plattform eindeutig (Spiele nutzen ihre eigene ID)
      name: def.name,
      installDir: null, // Launcher werden NICHT zeitlich getrackt
      coverPath: iconDataUrl,
      lastPlayed: null,
      importedPlaytimeSec: 0,
      kind: 'launcher',
      launchTarget: exe, // wird per shell.openPath gestartet
      exeNames: null // Launcher werden nicht getrackt
    })
    count++
  }
  return count
}
