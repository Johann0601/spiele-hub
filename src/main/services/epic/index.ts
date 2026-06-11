import { upsertGame } from '../../db'
import { scanEpic } from './scanner'
import { readEpicCoverMap } from './covers'
import { findGameExeNames } from '../exeNames'

/**
 * Scannt Epic-Spiele und speichert sie. Sie bekommen keinen importierten Startwert
 * (Epic trackt keine Spielzeit), werden aber dank install_dir vom Wächter automatisch
 * mitgemessen — wie Steam-Spiele.
 */
export function persistEpic(): number {
  const games = scanEpic()
  const covers = readEpicCoverMap() // CatalogItemId -> Cover-URL (Epics CDN)
  for (const g of games) {
    upsertGame({
      platform: 'epic',
      platformId: g.appName,
      name: g.name,
      installDir: g.installDir,
      coverPath: g.catalogItemId ? (covers.get(g.catalogItemId) ?? null) : null,
      lastPlayed: null,
      importedPlaytimeSec: 0,
      kind: 'game',
      launchTarget: g.launchUrl,
      exeNames: g.installDir ? findGameExeNames(g.installDir).join(',') || null : null
    })
  }
  return games.length
}
