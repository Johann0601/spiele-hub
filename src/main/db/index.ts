import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import type {
  GameCard,
  GameKind,
  GameStorageInfo,
  Platform,
  UpdateEvent,
  WishlistItem
} from '@shared/types'

// Eine einzige, app-weite DB-Verbindung. better-sqlite3 arbeitet synchron —
// das ist im Electron-Main-Prozess gewollt und einfach zu handhaben.
let db: Database.Database | null = null

/**
 * Migrationen werden der Reihe nach angewendet. "user_version" merkt sich,
 * wie weit wir schon sind, sodass jede Migration genau EINMAL läuft —
 * ohne bestehende Daten zu verlieren. So erweitern wir das Schema Phase für Phase.
 */
const MIGRATIONS: ((db: Database.Database) => void)[] = [
  // v1: Grundtabellen
  (database) => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS games (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        platform      TEXT    NOT NULL,            -- 'steam', später 'epic', ...
        platform_id   TEXT    NOT NULL,            -- z. B. Steam AppID
        name          TEXT    NOT NULL,
        install_dir   TEXT,                        -- absoluter Pfad zum Installationsordner
        cover_url     TEXT,                        -- lokaler Pfad zum Cover-Bild
        last_played   INTEGER,                     -- Unix-Zeit (Sekunden) des letzten Spielens
        created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        UNIQUE(platform, platform_id)
      );

      CREATE TABLE IF NOT EXISTS play_sessions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id       INTEGER NOT NULL,
        started_at    INTEGER NOT NULL,
        ended_at      INTEGER,
        duration_sec  INTEGER,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_game ON play_sessions(game_id);
    `)
  },
  // v2: eingefrorener Startwert der von Steam übernommenen Spielzeit (in Sekunden)
  (database) => {
    database.exec(`
      ALTER TABLE games ADD COLUMN imported_playtime_sec INTEGER NOT NULL DEFAULT 0;
    `)
  },
  // v3: Unterscheidung Spiel/Launcher + Start-Ziel (Steam-URL, Epic-URL oder exe-Pfad)
  (database) => {
    database.exec(`
      ALTER TABLE games ADD COLUMN kind TEXT NOT NULL DEFAULT 'game';
      ALTER TABLE games ADD COLUMN launch_target TEXT;
    `)
  },
  // v4: bekannte Spiel-exe-Namen (kommagetrennt) — Fallback-Erkennung für
  //     Anti-Cheat-Spiele, deren Pfad sich nicht auslesen lässt
  (database) => {
    database.exec(`
      ALTER TABLE games ADD COLUMN exe_names TEXT;
    `)
  },
  // v5 (Phase 3): Update-Erkennung + Historie.
  //   build_id          = Steam-Build-Nummer (ändert sich mit jedem Update)
  //   update_pending    = Steam meldet ausstehendes Update (StateFlags Bit 2)
  //   manifest_updated  = letzter Update-Zeitpunkt laut Steam-Manifest
  (database) => {
    database.exec(`
      ALTER TABLE games ADD COLUMN build_id TEXT;
      ALTER TABLE games ADD COLUMN update_pending INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE games ADD COLUMN manifest_updated INTEGER;

      CREATE TABLE IF NOT EXISTS update_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id     INTEGER NOT NULL,
        type        TEXT    NOT NULL,            -- 'erkannt' | 'installiert'
        old_build   TEXT,
        new_build   TEXT,
        created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_update_events_game ON update_events(game_id);
    `)
  },
  // v6 (Phase 4): verwaltete World-of-Tanks-Mods.
  //   enabled = Wunsch-Zustand; ob die Datei wirklich im aktuellen
  //   Versionsordner liegt, wird zur Laufzeit geprüft (installed).
  (database) => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS wot_mods (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name  TEXT    NOT NULL UNIQUE,
        enabled    INTEGER NOT NULL DEFAULT 1,
        added_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
    `)
  },
  // v7: Speicherplatz-Analyse — berechnete Ordnergröße pro Spiel (gecacht,
  //     weil das Durchlaufen großer Spielordner einige Sekunden dauert).
  (database) => {
    database.exec(`
      ALTER TABLE games ADD COLUMN size_bytes INTEGER;
      ALTER TABLE games ADD COLUMN size_checked_at INTEGER;
    `)
  },
  // v8: Wunschliste mit Preisalarm — Steam-Spiele, deren Preis die App
  //     regelmäßig prüft. Rabatte landen in der 🔔-Glocke.
  (database) => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS wishlist (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        app_id         TEXT    NOT NULL UNIQUE,   -- Steam-AppID
        name           TEXT    NOT NULL,
        cover_url      TEXT,
        price_cents    INTEGER,                   -- letzter geprüfter Preis
        original_cents INTEGER,                   -- Preis ohne Rabatt
        discount_pct   INTEGER NOT NULL DEFAULT 0,
        checked_at     INTEGER,
        added_at       INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
    `)
  },
  // v9: Wunschliste wird shop-übergreifend — Epic-Spiele kommen dazu.
  //     app_id ist bei Epic "namespace:offerId", shop unterscheidet die Quellen.
  (database) => {
    database.exec(`
      ALTER TABLE wishlist ADD COLUMN shop TEXT NOT NULL DEFAULT 'steam';
      ALTER TABLE wishlist ADD COLUMN store_url TEXT;
    `)
  },
  // v10: Deinstallierte Spiele erkennen. installed=0 versteckt den Eintrag
  //      (Bibliothek, Glocke, Tracking) — Spielzeiten bleiben aber erhalten
  //      und leben bei einer Neuinstallation einfach wieder auf.
  (database) => {
    database.exec(`
      ALTER TABLE games ADD COLUMN installed INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE games ADD COLUMN last_seen_at INTEGER;
    `)
  }
]

export function initDatabase(): Database.Database {
  if (db) return db

  const dbPath = join(app.getPath('userData'), 'spiele-hub.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Offene Migrationen anwenden.
  let version = (db.pragma('user_version', { simple: true }) as number) ?? 0
  for (let v = version; v < MIGRATIONS.length; v++) {
    MIGRATIONS[v](db)
    db.pragma(`user_version = ${v + 1}`)
  }

  return db
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Datenbank wurde noch nicht initialisiert — initDatabase() zuerst aufrufen.')
  return db
}

// ---------------------------------------------------------------------------
//  Abfragen rund um Spiele
// ---------------------------------------------------------------------------

export interface UpsertGameInput {
  platform: Platform
  platformId: string
  name: string
  installDir: string | null
  coverPath: string | null
  lastPlayed: number | null
  importedPlaytimeSec: number
  kind: GameKind
  launchTarget: string | null
  exeNames: string | null // kommagetrennte, kleingeschriebene exe-Namen
}

/**
 * Fügt ein Spiel/Launcher ein oder aktualisiert es (anhand platform + platform_id).
 * WICHTIG: imported_playtime_sec wird NUR beim ersten Einfügen gesetzt und danach
 * nie wieder überschrieben — der Steam-Startwert bleibt also "eingefroren",
 * während unsere eigenen Sitzungen oben drauf zählen.
 */
export function upsertGame(input: UpsertGameInput): void {
  const stmt = getDatabase().prepare(`
    INSERT INTO games (platform, platform_id, name, install_dir, cover_url, last_played, imported_playtime_sec, kind, launch_target, exe_names, installed, last_seen_at)
    VALUES (@platform, @platformId, @name, @installDir, @coverPath, @lastPlayed, @importedPlaytimeSec, @kind, @launchTarget, @exeNames, 1, strftime('%s','now'))
    ON CONFLICT(platform, platform_id) DO UPDATE SET
      name          = excluded.name,
      install_dir   = excluded.install_dir,
      -- Vorhandenes Cover behalten, wenn der Scanner keins liefert
      -- (Online-Cover werden separat nachgetragen und sollen überleben).
      cover_url     = COALESCE(excluded.cover_url, games.cover_url),
      kind          = excluded.kind,
      launch_target = excluded.launch_target,
      exe_names     = excluded.exe_names,
      last_played   = MAX(COALESCE(games.last_played, 0), COALESCE(excluded.last_played, 0)),
      -- Vom Scanner gesehen = (wieder) installiert.
      installed     = 1,
      last_seen_at  = strftime('%s','now')
  `)
  stmt.run(input)
}

/**
 * Spiele einer Plattform, die der gerade abgeschlossene Scan NICHT mehr
 * gesehen hat, als deinstalliert markieren (inkl. Update-Hinweis löschen).
 * Wird nur für Plattformen aufgerufen, deren Scan erfolgreich lief.
 */
export function markMissingUninstalled(platforms: string[], scanStartedAt: number): number {
  if (platforms.length === 0) return 0
  const marks = platforms.map(() => '?').join(',')
  const info = getDatabase()
    .prepare(
      `UPDATE games SET installed = 0, update_pending = 0
       WHERE kind = 'game' AND installed = 1 AND platform IN (${marks})
         AND (last_seen_at IS NULL OR last_seen_at < ?)`
    )
    .run(...platforms, scanStartedAt)
  return info.changes
}

interface GameRow {
  id: number
  kind: GameKind
  platform: Platform
  platform_id: string
  name: string
  install_dir: string | null
  cover_url: string | null
  last_played: number | null
  total_playtime_sec: number
  update_pending: number
  manifest_updated: number | null
  size_bytes: number | null
}

/**
 * Liefert Spiele inkl. Gesamt-Spielzeit:
 *   Gesamt = eingefrorener Steam-Startwert + Summe aller abgeschlossenen Sitzungen.
 * `installed` wählt zwischen installierten (1, Standard) und deinstallierten (0) Einträgen.
 */
function queryGames(installed: 0 | 1): GameCard[] {
  const rows = getDatabase()
    .prepare(
      `
      SELECT
        g.id, g.kind, g.platform, g.platform_id, g.name, g.install_dir, g.cover_url, g.last_played,
        g.update_pending, g.manifest_updated, g.size_bytes,
        g.imported_playtime_sec
          + COALESCE((SELECT SUM(s.duration_sec) FROM play_sessions s
                      WHERE s.game_id = g.id AND s.duration_sec IS NOT NULL), 0) AS total_playtime_sec
      FROM games g
      WHERE g.installed = ?
      ORDER BY total_playtime_sec DESC, g.name COLLATE NOCASE ASC
    `
    )
    .all(installed) as GameRow[]

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    platform: r.platform,
    platformId: r.platform_id,
    name: r.name,
    installDir: r.install_dir,
    coverUrl: resolveCoverUrl(r),
    totalPlaytimeSec: r.total_playtime_sec,
    lastPlayed: r.last_played,
    updatePending: r.update_pending === 1,
    manifestLastUpdated: r.manifest_updated,
    sizeBytes: r.size_bytes
  }))
}

/** Alle installierten Spiele/Launcher (für Bibliothek, Tracking, Glocke). */
export function listGames(): GameCard[] {
  return queryGames(1)
}

/**
 * Spiele, die mal installiert waren und jetzt nicht mehr (installed = 0) —
 * Grundlage für die Kategorie „Nicht installiert" bei Launchern ohne Katalog-API.
 * Spielzeiten bleiben erhalten, deshalb tauchen sie hier mit ihren Werten auf.
 */
export function listUninstalledGames(): GameCard[] {
  return queryGames(0).filter((g) => g.kind === 'game')
}

/**
 * Bestimmt die Cover-Quelle für die Oberfläche:
 *  - lokal gefunden  -> über unser cover://-Protokoll (offline, schnell)
 *  - sonst bei Steam -> offizielles Steam-CDN als Online-Fallback
 *  - sonst           -> null (Oberfläche zeigt einen Buchstaben-Platzhalter)
 */
function resolveCoverUrl(r: GameRow): string | null {
  // Launcher-Icons (data:) und CDN-Cover (https, z. B. Epic) direkt nutzen.
  if (r.cover_url?.startsWith('data:') || r.cover_url?.startsWith('http')) return r.cover_url
  // Lokal gefundenes Cover -> über unser cover://-Protokoll (Datei wird gestreamt).
  if (r.cover_url) return `cover://${r.platform}/${r.platform_id}`
  // Steam ohne lokales Cover -> offizielles CDN.
  if (r.platform === 'steam') {
    return `https://steamcdn-a.akamaihd.net/steam/apps/${r.platform_id}/library_600x900.jpg`
  }
  return null
}

/** Gibt den lokalen Cover-Dateipfad eines Spiels zurück (für das cover://-Protokoll). */
export function getCoverPath(platform: string, platformId: string): string | null {
  const row = getDatabase()
    .prepare('SELECT cover_url FROM games WHERE platform = ? AND platform_id = ?')
    .get(platform, platformId) as { cover_url: string | null } | undefined
  return row?.cover_url ?? null
}

// ---------------------------------------------------------------------------
//  Spielzeit-Tracking (Sitzungen)
// ---------------------------------------------------------------------------

/**
 * Alle ECHTEN Spiele, die wir per Prozess überwachen (haben einen Install-Ordner).
 * Launcher (kind='launcher') werden bewusst NICHT getrackt.
 */
export interface TrackableGame {
  id: number
  platformId: string
  installDir: string
  exeNames: string[] // bekannte Spiel-exe-Namen (kleingeschrieben), Fallback-Erkennung
}

export function listTrackableGames(): TrackableGame[] {
  const rows = getDatabase()
    .prepare(`SELECT id, platform_id AS platformId, install_dir AS installDir, exe_names AS exeNames
              FROM games
              WHERE kind = 'game' AND installed = 1 AND install_dir IS NOT NULL AND install_dir <> ''`)
    .all() as { id: number; platformId: string; installDir: string; exeNames: string | null }[]

  return rows.map((r) => ({
    id: r.id,
    platformId: r.platformId,
    installDir: r.installDir,
    exeNames: r.exeNames ? r.exeNames.split(',').filter(Boolean) : []
  }))
}

/** Gibt das Start-Ziel (Steam-/Epic-URL oder exe-Pfad) eines Eintrags zurück. */
export function getLaunchInfo(
  id: number
): { platform: Platform; platformId: string; launchTarget: string | null } | null {
  const row = getDatabase()
    .prepare('SELECT platform, platform_id AS platformId, launch_target AS launchTarget FROM games WHERE id = ?')
    .get(id) as { platform: Platform; platformId: string; launchTarget: string | null } | undefined
  return row ?? null
}

/** Berechnete Ordnergröße eines Spiels speichern (mit Zeitstempel). */
export function setGameSize(gameId: number, sizeBytes: number): void {
  getDatabase()
    .prepare(
      `UPDATE games SET size_bytes = ?, size_checked_at = strftime('%s','now') WHERE id = ?`
    )
    .run(sizeBytes, gameId)
}

/** Alle installierten Spiele für die Speicherplatz-Analyse (inkl. Cache-Stand). */
export function listGamesForStorage(): GameStorageInfo[] {
  return getDatabase()
    .prepare(
      `SELECT id AS gameId, platform_id AS platformId, name, platform, install_dir AS installDir,
              size_bytes AS sizeBytes, size_checked_at AS checkedAt, last_played AS lastPlayed
       FROM games
       WHERE kind = 'game' AND installed = 1 AND install_dir IS NOT NULL AND install_dir <> ''
       ORDER BY size_bytes DESC NULLS LAST, name COLLATE NOCASE ASC`
    )
    .all() as GameStorageInfo[]
}

// ---------------------------------------------------------------------------
//  Wunschliste (Preisalarm)
// ---------------------------------------------------------------------------

export function listWishlist(): WishlistItem[] {
  return getDatabase()
    .prepare(
      `SELECT id, app_id AS appId, shop, name, cover_url AS coverUrl, store_url AS storeUrl,
              price_cents AS priceCents, original_cents AS originalCents,
              discount_pct AS discountPct, checked_at AS checkedAt
       FROM wishlist
       ORDER BY discount_pct DESC, name COLLATE NOCASE ASC`
    )
    .all() as WishlistItem[]
}

export function addWishlistItem(
  appId: string,
  name: string,
  coverUrl: string | null,
  shop: 'steam' | 'epic' = 'steam',
  storeUrl: string | null = null
): void {
  getDatabase()
    .prepare(
      `INSERT INTO wishlist (app_id, name, cover_url, shop, store_url) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(app_id) DO NOTHING`
    )
    .run(appId, name, coverUrl, shop, storeUrl)
}

export function removeWishlistItem(appId: string): void {
  getDatabase().prepare('DELETE FROM wishlist WHERE app_id = ?').run(appId)
}

/** Name/Cover eines Wunschlisten-Eintrags auffrischen (z. B. beim Steam-Import). */
export function updateWishlistMeta(appId: string, name: string, coverUrl: string | null): void {
  getDatabase()
    .prepare('UPDATE wishlist SET name = ?, cover_url = COALESCE(?, cover_url) WHERE app_id = ?')
    .run(name, coverUrl, appId)
}

/** Geprüften Preis eines Wunschlisten-Eintrags speichern. */
export function updateWishlistPrice(
  appId: string,
  priceCents: number | null,
  originalCents: number | null,
  discountPct: number
): void {
  getDatabase()
    .prepare(
      `UPDATE wishlist SET price_cents = ?, original_cents = ?, discount_pct = ?,
              checked_at = strftime('%s','now')
       WHERE app_id = ?`
    )
    .run(priceCents, originalCents, discountPct, appId)
}

/** Grunddaten eines Eintrags (für Detail-Abfragen wie Store-Infos/News/Erfolge). */
export function getGameBasic(
  id: number
): { platform: Platform; platformId: string; name: string } | null {
  const row = getDatabase()
    .prepare('SELECT platform, platform_id AS platformId, name FROM games WHERE id = ?')
    .get(id) as { platform: Platform; platformId: string; name: string } | undefined
  return row ?? null
}

/**
 * Spiele, deren Online-Cover nur ein Wikipedia-Logo ist — Kandidaten für ein
 * Upgrade auf echte Box-Art, sobald ein SteamGridDB-Key hinterlegt wird.
 */
export function listGamesWithWikiCover(
  platforms: string[]
): { platform: string; platformId: string; name: string }[] {
  const marks = platforms.map(() => '?').join(',')
  return getDatabase()
    .prepare(
      `SELECT platform, platform_id AS platformId, name FROM games
       WHERE kind = 'game' AND platform IN (${marks})
         AND cover_url LIKE '%wikimedia.org%'`
    )
    .all(...platforms) as { platform: string; platformId: string; name: string }[]
}

/** Startet eine neue Sitzung (Spiel wurde als laufend erkannt). Gibt die Sitzungs-ID zurück. */
export function startSession(gameId: number, startedAt: number): number {
  const info = getDatabase()
    .prepare('INSERT INTO play_sessions (game_id, started_at) VALUES (?, ?)')
    .run(gameId, startedAt)
  // last_played gleich mit aktualisieren.
  getDatabase().prepare('UPDATE games SET last_played = ? WHERE id = ?').run(startedAt, gameId)
  return Number(info.lastInsertRowid)
}

/** Schließt eine Sitzung ab und schreibt die gemessene Dauer. */
export function endSession(sessionId: number, endedAt: number, startedAt: number): void {
  const duration = Math.max(0, endedAt - startedAt)
  getDatabase()
    .prepare('UPDATE play_sessions SET ended_at = ?, duration_sec = ? WHERE id = ?')
    .run(endedAt, duration, sessionId)
}

/**
 * Räumt verwaiste Sitzungen auf: Falls die App während eines laufenden Spiels
 * abstürzte, gibt es Sitzungen ohne ended_at. Beim Start setzen wir deren Ende
 * konservativ auf started_at (Dauer 0), damit nichts "ewig" weiterläuft.
 */
export function closeOrphanSessions(): void {
  getDatabase().exec(
    `UPDATE play_sessions SET ended_at = started_at, duration_sec = 0
     WHERE ended_at IS NULL`
  )
}

/**
 * Setzt den "mitgebrachten" Spielzeit-Startwert manuell (z. B. für Epic-Spiele,
 * deren Spielzeit nur online liegt — der Nutzer überträgt sie einmalig von Hand).
 * Selbst getrackte Sitzungen zählen weiterhin oben drauf.
 */
export function setImportedPlaytime(gameId: number, seconds: number): void {
  getDatabase()
    .prepare('UPDATE games SET imported_playtime_sec = ? WHERE id = ?')
    .run(Math.max(0, Math.floor(seconds)), gameId)
}

/**
 * Alle Spiele einer Plattform mit Startwert und Summe der eigenen Sitzungen —
 * Grundlage für den Online-Spielzeit-Abgleich (z. B. Epic).
 */
export function listPlatformPlaytimes(
  platform: string
): { id: number; platformId: string; importedSec: number; sessionSec: number }[] {
  return getDatabase()
    .prepare(
      `
      SELECT g.id, g.platform_id AS platformId, g.imported_playtime_sec AS importedSec,
        COALESCE((SELECT SUM(s.duration_sec) FROM play_sessions s
                  WHERE s.game_id = g.id AND s.duration_sec IS NOT NULL), 0) AS sessionSec
      FROM games g
      WHERE g.platform = ? AND g.kind = 'game'
    `
    )
    .all(platform) as { id: number; platformId: string; importedSec: number; sessionSec: number }[]
}

// ---------------------------------------------------------------------------
//  Phase 4: World-of-Tanks-Mods
// ---------------------------------------------------------------------------

export interface WotModRow {
  id: number
  fileName: string
  enabled: number
}

/** Alle verwalteten WoT-Mods. */
export function listWotMods(): WotModRow[] {
  return getDatabase()
    .prepare('SELECT id, file_name AS fileName, enabled FROM wot_mods ORDER BY file_name COLLATE NOCASE')
    .all() as WotModRow[]
}

/** Legt eine Mod an, falls noch nicht bekannt (Standard: aktiviert). */
export function ensureWotMod(fileName: string): void {
  getDatabase().prepare('INSERT OR IGNORE INTO wot_mods (file_name) VALUES (?)').run(fileName)
}

export function setWotModEnabled(id: number, enabled: boolean): void {
  getDatabase().prepare('UPDATE wot_mods SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
}

export function getWotModById(id: number): WotModRow | null {
  const row = getDatabase()
    .prepare('SELECT id, file_name AS fileName, enabled FROM wot_mods WHERE id = ?')
    .get(id) as WotModRow | undefined
  return row ?? null
}

/** Pfad zum World-of-Tanks-Installationsordner aus der Spiele-Tabelle. */
export function getWotInstallDir(): string | null {
  const row = getDatabase()
    .prepare(`SELECT install_dir AS dir FROM games WHERE name = 'World of Tanks' AND platform = 'steam'`)
    .get() as { dir: string | null } | undefined
  return row?.dir ?? null
}

// ---------------------------------------------------------------------------
//  Phase 3: Update-Erkennung + Historie
// ---------------------------------------------------------------------------

/**
 * Verarbeitet den frisch gescannten Update-Zustand eines Spiels (Steam,
 * Battle.net, …) und schreibt bei Änderungen Historie-Einträge:
 *  - Build/Version hat sich geändert  -> Ereignis 'installiert' (Update wurde eingespielt)
 *  - update_pending wechselt auf 1    -> Ereignis 'erkannt' (Update steht aus)
 * Gibt true zurück, wenn sich etwas geändert hat.
 */
export function applyUpdateState(
  platform: string,
  platformId: string,
  buildId: string | null,
  updatePending: boolean,
  manifestUpdated: number | null
): boolean {
  const db = getDatabase()
  const prev = db
    .prepare(
      `SELECT id, build_id AS buildId, update_pending AS pending
       FROM games WHERE platform = ? AND platform_id = ?`
    )
    .get(platform, platformId) as
    | { id: number; buildId: string | null; pending: number }
    | undefined
  if (!prev) return false

  let changed = false
  const insertEvent = db.prepare(
    `INSERT INTO update_events (game_id, type, old_build, new_build) VALUES (?, ?, ?, ?)`
  )

  // Update wurde installiert: bekannte Build-Nummer hat sich geändert.
  if (prev.buildId && buildId && prev.buildId !== buildId) {
    insertEvent.run(prev.id, 'installiert', prev.buildId, buildId)
    changed = true
  }

  // Neues ausstehendes Update entdeckt (Flanke 0 -> 1).
  if (updatePending && !prev.pending) {
    insertEvent.run(prev.id, 'erkannt', buildId, null)
    changed = true
  }

  db.prepare(
    `UPDATE games SET build_id = ?, update_pending = ?, manifest_updated = ? WHERE id = ?`
  ).run(buildId, updatePending ? 1 : 0, manifestUpdated, prev.id)

  return changed
}

/** Cover-URL eines Spiels nachträglich setzen (z. B. aus Online-Quellen). */
export function setGameCover(platform: string, platformId: string, url: string): void {
  getDatabase()
    .prepare('UPDATE games SET cover_url = ? WHERE platform = ? AND platform_id = ?')
    .run(url, platform, platformId)
}

/** Spiele ohne Cover (für die Online-Cover-Suche). */
export function listGamesWithoutCover(
  platforms: string[]
): { platform: string; platformId: string; name: string }[] {
  const marks = platforms.map(() => '?').join(',')
  return getDatabase()
    .prepare(
      `SELECT platform, platform_id AS platformId, name FROM games
       WHERE kind = 'game' AND installed = 1
         AND (cover_url IS NULL OR cover_url = '') AND platform IN (${marks})`
    )
    .all(...platforms) as { platform: string; platformId: string; name: string }[]
}

/** Start-Ziel des Launcher-Eintrags einer Plattform (z. B. Battle.net öffnen). */
export function getLauncherTarget(platform: string): string | null {
  const row = getDatabase()
    .prepare(
      `SELECT launch_target AS target FROM games
       WHERE platform = ? AND platform_id = 'launcher'`
    )
    .get(platform) as { target: string | null } | undefined
  return row?.target ?? null
}

/** Die Update-Historie (neueste zuerst), optional auf ein Spiel begrenzt. */
export function listUpdateEvents(gameId?: number, limit = 100): UpdateEvent[] {
  const where = gameId ? 'WHERE e.game_id = ?' : ''
  const rows = getDatabase()
    .prepare(
      `SELECT e.id, e.game_id AS gameId, g.name AS gameName, e.type,
              e.old_build AS oldBuild, e.new_build AS newBuild, e.created_at AS createdAt
       FROM update_events e JOIN games g ON g.id = e.game_id
       ${where}
       ORDER BY e.created_at DESC, e.id DESC LIMIT ?`
    )
    .all(...(gameId ? [gameId, limit] : [limit])) as UpdateEvent[]
  return rows.map((r) => ({ ...r, type: r.type as UpdateEvent['type'] }))
}
