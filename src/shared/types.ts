// Typen, die sowohl der Main-Prozess als auch der React-Renderer kennen.
// Ein einziger Ort für die "Form" unserer Daten -> keine Doppel-Definitionen.

export type Platform = 'steam' | 'epic' | 'modrinth' | 'curseforge' | 'ftb'

/** 'game' = spielbarer Eintrag mit Tracking, 'launcher' = startbare App ohne Tracking. */
export type GameKind = 'game' | 'launcher'

/** Ein Spiel/Launcher, wie es die Oberfläche anzeigt (inkl. berechneter Gesamt-Spielzeit). */
export interface GameCard {
  id: number
  kind: GameKind
  platform: Platform
  platformId: string // bei Steam: die AppID
  name: string
  installDir: string | null
  coverUrl: string | null // 'cover://steam/440', eine data:-URL (Launcher-Icon) oder null
  totalPlaytimeSec: number // Steam-Startwert + selbst getrackte Sitzungen
  lastPlayed: number | null // Unix-Zeit (Sekunden)
  updatePending: boolean // Steam meldet ein ausstehendes Update (StateFlags Bit 2)
  manifestLastUpdated: number | null // letzter Update-Zeitpunkt laut Steam (Unix-Sek.)
}

// --- Phase 5: Minecraft-Profile/Modpacks ---

export type McLauncher = 'modrinth' | 'curseforge' | 'ftb'

/** Ein Minecraft-Profil/Modpack aus einem der Launcher. */
export interface McProfile {
  launcher: McLauncher
  name: string
  mcVersion: string | null // z. B. "1.21.1"
  modLoader: string | null // z. B. "fabric 0.18.4", "neoforge-21.1.216"
  modCount: number | null // Anzahl Mods (falls ermittelbar)
  lastPlayed: number | null // Unix-Sekunden
  playtimeSec: number | null // Spielzeit laut Launcher (falls vorhanden)
  iconUrl: string | null // data:-URL oder https
  instancePath: string // Ordner der Instanz (zum Öffnen im Explorer)
}

// --- Phase 4: World-of-Tanks-Mods ---

/** Eine verwaltete WoT-Mod (.wotmod-Datei). */
export interface WotMod {
  id: number
  fileName: string // z. B. "me.poliroid.pmod_1.81.05.wotmod"
  displayName: string // Dateiname ohne Endung
  enabled: boolean // soll aktiv sein (Wunsch-Zustand laut App)
  installed: boolean // liegt tatsächlich im aktuellen Versionsordner
  sizeBytes: number
}

/** Zustand des WoT-Mod-Managements. */
export interface WotStatus {
  ok: boolean
  wotDir: string | null // Spielordner (…\World of Tanks\eu)
  currentVersion: string | null // z. B. "2.3.0.1"
  mods: WotMod[]
  needsRestore: number // aktive Mods, die im aktuellen Versionsordner fehlen
  error?: string
}

/** Ein Eintrag der Update-Historie. */
export interface UpdateEvent {
  id: number
  gameId: number
  gameName: string
  type: 'erkannt' | 'installiert'
  oldBuild: string | null
  newBuild: string | null
  createdAt: number // Unix-Zeit (Sekunden)
}

// --- Phase 6: System / Treiber ---

export type DeviceCategory =
  | 'Grafikkarte'
  | 'Maus'
  | 'Tastatur'
  | 'Netzwerk'
  | 'Audio'
  | 'Speicher'
  | 'Bluetooth'
  | 'Prozessor'
  | 'Monitor'

/** Ein erkanntes Gerät mit seinem aktuell INSTALLIERTEN Treiber. */
export interface DeviceInfo {
  category: DeviceCategory
  name: string
  vendor: string
  driverVersion: string // kann leer sein (z. B. Maus/Tastatur/Speicher)
  driverDate: string | null // 'yyyy-MM-dd'
  isNvidiaGpu: boolean // nur für diese ist eine Update-Prüfung möglich
  storage?: { totalBytes: number; freeBytes: number } // nur Kategorie 'Speicher'
}

/** Ergebnis der Nvidia-Treiber-Update-Prüfung (nur für Nvidia-GPUs). */
export interface NvidiaUpdate {
  ok: boolean
  installedVersion: string | null // dekodiert, z. B. "596.49"
  latestVersion: string | null // z. B. "610.47"
  updateAvailable: boolean
  downloadUrl: string | null // offizieller NVIDIA-Download
  releaseDate: string | null
  error?: string
}

/** Ein aktuell laufendes Spiel (vom Wächter erkannt). */
export interface RunningGame {
  gameId: number
  startedAt: number // Unix-Zeit (Sekunden), seit wann es läuft
}

/** Ergebnis eines Steam-Scans. */
export interface ScanResult {
  ok: boolean
  steamPath: string | null
  libraries: string[]
  games: GameCard[]
  error?: string
}

// --- Konten: verbundene externe Konten (z. B. Epic) ---

/** Zustand der Epic-Konto-Verbindung. */
export interface EpicAccountStatus {
  connected: boolean
  displayName: string | null
}

/** Ergebnis des Epic-Spielzeit-Abgleichs. */
export interface EpicSyncResult {
  ok: boolean
  updatedGames: number // wie viele Spiele eine neue Spielzeit bekommen haben
  error?: string
}

// --- Shops: Plattform-Details & Angebote ---

/** Ein Gratisspiel aus dem Epic Store (aktuell oder angekündigt). */
export interface EpicFreeGame {
  title: string
  status: 'gratis' | 'demnaechst'
  startDate: number | null // Unix-Sekunden
  endDate: number | null
  originalPrice: string | null // formatiert, z. B. "17,99 €"
  coverUrl: string | null // Hochformat (für die Shop-Seite)
  wideCoverUrl: string | null // Querformat (für die Startseite)
  storeUrl: string | null
}

/** Ein Spiel aus der kompletten Epic-Bibliothek (auch nicht installiert). */
export interface EpicLibraryGame {
  title: string
  appName: string // Epics interne ID (== platformId installierter Spiele)
  installed: boolean
  playtimeSec: number // offizielle Epic-Spielzeit
  coverUrl: string | null
}

/** Ergebnis des Epic-Bibliotheks-Abrufs. */
export interface EpicLibraryResult {
  ok: boolean
  games: EpicLibraryGame[]
  error?: string
}

/** Ein Steam-Angebot (aktueller Sale). */
export interface SteamOffer {
  appId: number
  name: string
  discountPercent: number
  originalPriceCents: number | null
  finalPriceCents: number | null
  currency: string
  coverUrl: string | null // breites Header-Bild
  storeUrl: string
}
