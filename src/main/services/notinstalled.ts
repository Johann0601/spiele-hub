// Kategorie „Nicht installiert": besessene/bekannte Spiele, die gerade nicht
// installiert sind — quellenübergreifend zusammengeführt:
//   1. Steam  — kompletter Besitz-Katalog (Web-API-Key), inkl. „zuletzt gespielt"
//   2. Epic   — komplette Bibliothek (verbundenes Konto)
//   3. Rest   — Launcher ohne Katalog-API: nur was mal installiert war (DB)
// Doppelungen vermeiden: installierte Spiele fliegen raus, und für Steam/Epic
// nutzen wir den (reicheren) Katalog statt der DB-Reste, sofern er lädt.

import type { NotInstalledGame, NotInstalledResult } from '@shared/types'
import { listGames, listUninstalledGames } from '../db'
import { getSteamApiKey } from './steam/webapi'
import { getSteamOwnedGames } from './steam/ownedgames'
import { getEpicLibrary } from './epic/library'

export async function listNotInstalledGames(): Promise<NotInstalledResult> {
  // Was IST installiert? Diese IDs aus dem Katalog ausblenden.
  const installed = listGames()
  const installedSteam = new Set(
    installed.filter((g) => g.platform === 'steam').map((g) => g.platformId)
  )

  const games: NotInstalledGame[] = []
  const steamKeyMissing = getSteamApiKey() === null

  // 1) Steam-Besitz-Katalog (kann null sein: kein Key / private Spieldetails).
  const owned = await getSteamOwnedGames().catch(() => null)
  const steamLoaded = owned !== null
  if (owned) {
    for (const g of owned) {
      const id = String(g.appId)
      if (installedSteam.has(id)) continue
      games.push({
        source: 'steam',
        platformId: id,
        name: g.name,
        coverUrl: `https://steamcdn-a.akamaihd.net/steam/apps/${id}/library_600x900.jpg`,
        playtimeSec: g.playtimeSec,
        lastPlayed: g.lastPlayed,
        installUrl: `steam://install/${id}`
      })
    }
  }

  // 2) Epic-Bibliothek (ok:false = kein Konto verbunden / Abruf fehlgeschlagen).
  const epic = await getEpicLibrary().catch(() => null)
  const epicConnected = epic?.ok === true
  if (epic?.ok) {
    for (const g of epic.games) {
      if (g.installed) continue
      games.push({
        source: 'epic',
        platformId: g.appName,
        name: g.title,
        coverUrl: g.coverUrl,
        playtimeSec: g.playtimeSec,
        lastPlayed: null, // Epic liefert kein „zuletzt gespielt"
        installUrl: `com.epicgames.launcher://apps/${g.appName}?action=install`
      })
    }
  }

  // 3) Launcher ohne Katalog-API: früher installierte Spiele aus der DB.
  //    Steam/Epic nur, wenn ihr Katalog NICHT lud (sonst Doppelungen).
  for (const g of listUninstalledGames()) {
    if (g.platform === 'steam' && steamLoaded) continue
    if (g.platform === 'epic' && epicConnected) continue
    games.push({
      source: g.platform,
      platformId: g.platformId,
      name: g.name,
      coverUrl: g.coverUrl,
      playtimeSec: g.totalPlaytimeSec,
      lastPlayed: g.lastPlayed,
      installUrl: g.platform === 'steam' ? `steam://install/${g.platformId}` : null
    })
  }

  // „Zuletzt gespielt" zuerst (wo bekannt), dann nach Spielzeit, dann A–Z.
  games.sort(
    (a, b) =>
      (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) ||
      b.playtimeSec - a.playtimeSec ||
      a.name.localeCompare(b.name, 'de')
  )

  return { ok: true, games, steamKeyMissing, steamLoaded, epicConnected }
}
