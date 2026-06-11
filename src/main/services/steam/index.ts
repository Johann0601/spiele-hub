import { applySteamUpdateState, getDatabase, listGames, upsertGame } from '../../db'
import { scanSteam } from './scanner'
import { findGameExeNames } from '../exeNames'
import type { ScanResult } from '@shared/types'

/**
 * Scannt alle Steam-Bibliotheken und schreibt die gefundenen Spiele in die DB.
 * Danach werden die Spiele (inkl. berechneter Gesamt-Spielzeit) zurückgegeben.
 */
export function scanAndPersistSteam(): ScanResult {
  const scan = scanSteam()

  if (!scan.steamPath) {
    return {
      ok: false,
      steamPath: null,
      libraries: [],
      games: [],
      error: 'Steam-Installation nicht gefunden.'
    }
  }

  // Alle Upserts in einer Transaktion = schnell und atomar.
  const db = getDatabase()
  const writeAll = db.transaction(() => {
    for (const g of scan.games) {
      upsertGame({
        platform: 'steam',
        platformId: g.appid,
        name: g.name,
        installDir: g.installDir,
        coverPath: g.coverPath,
        lastPlayed: g.lastPlayed,
        importedPlaytimeSec: g.playtimeMinutes * 60, // Minuten -> Sekunden
        kind: 'game',
        launchTarget: `steam://rungameid/${g.appid}`,
        exeNames: g.installDir ? findGameExeNames(g.installDir).join(',') || null : null
      })
      // Phase 3: Update-Zustand verarbeiten (erkennt neue Updates & schreibt Historie).
      applySteamUpdateState(g.appid, g.buildId, g.updatePending, g.manifestLastUpdated)
    }
  })
  writeAll()

  return {
    ok: true,
    steamPath: scan.steamPath,
    libraries: scan.libraries,
    games: listGames()
  }
}
