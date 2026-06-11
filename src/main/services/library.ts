import { listGames } from '../db'
import { scanAndPersistSteam } from './steam'
import { persistEpic } from './epic'
import { persistLaunchers } from './launchers'
import type { ScanResult } from '@shared/types'

/**
 * Kompletter Bibliotheks-Scan: Steam-Spiele + Epic-Spiele + installierte Launcher.
 * Jede Quelle ist gekapselt und darf einzeln fehlschlagen, ohne den Rest zu stoppen.
 */
export async function scanLibrary(): Promise<ScanResult> {
  let steamPath: string | null = null
  let libraries: string[] = []

  try {
    const steam = scanAndPersistSteam()
    steamPath = steam.steamPath
    libraries = steam.libraries
  } catch {
    /* Steam-Scan fehlgeschlagen -> trotzdem weiter */
  }
  try {
    persistEpic()
  } catch {
    /* Epic-Scan fehlgeschlagen -> trotzdem weiter */
  }
  try {
    await persistLaunchers()
  } catch {
    /* Launcher-Erkennung fehlgeschlagen -> trotzdem weiter */
  }

  return { ok: true, steamPath, libraries, games: listGames() }
}
