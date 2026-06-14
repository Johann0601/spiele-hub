import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AchievementsResult,
  DeviceInfo,
  EpicAccountStatus,
  EpicFreeGame,
  EpicLibraryResult,
  EpicSearchResult,
  EpicSyncResult,
  GameCard,
  GameDetails,
  GameNewsItem,
  GamePriceInfo,
  GameRef,
  GameStorageInfo,
  ItadStatus,
  NvidiaUpdate,
  RunningGame,
  McProfile,
  NotInstalledResult,
  ScanResult,
  SgdbStatus,
  SteamKeyStatus,
  SteamOffer,
  SteamSearchResult,
  UpdateEvent,
  WishlistItem,
  WotStatus
} from '@shared/types'

// Die EINZIGEN Funktionen, die der React-Code aufrufen darf.
// Alles läuft über ipcRenderer.invoke -> ipcMain.handle (Anfrage/Antwort).
const api = {
  getDbStatus: (): Promise<{ ok: boolean; gameCount: number; dbPath: string }> =>
    ipcRenderer.invoke('app:db-status'),

  /** Aktuelle App-Version (aus package.json). */
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),

  /** Heruntergeladenes App-Update jetzt installieren (App startet neu). */
  installAppUpdate: (): Promise<void> => ipcRenderer.invoke('app:install-update'),

  /** Meldet sich, wenn ein App-Update fertig heruntergeladen ist (mit Versionsnummer). */
  onAppUpdateReady: (cb: (version: string) => void): (() => void) => {
    const handler = (_e: unknown, version: string): void => cb(version)
    ipcRenderer.on('app:update-ready', handler)
    return () => ipcRenderer.removeListener('app:update-ready', handler)
  },

  /** Komplette Bibliothek scannen (Steam + Epic + Launcher), speichern, zurückgeben. */
  scanLibrary: (): Promise<ScanResult> => ipcRenderer.invoke('library:scan'),

  /** Bereits gespeicherte Spiele aus der DB laden (ohne neuen Scan). */
  listGames: (): Promise<GameCard[]> => ipcRenderer.invoke('games:list'),

  /** Besessene/bekannte, aber nicht installierte Spiele (Steam + Epic + DB-Reste). */
  listNotInstalledGames: (): Promise<NotInstalledResult> =>
    ipcRenderer.invoke('games:not-installed'),

  /** Spiel/Launcher starten (per Eintrags-ID). */
  launchGame: (id: number): Promise<{ ok: boolean }> => ipcRenderer.invoke('game:launch', id),

  /** Den Launcher einer Plattform öffnen (z. B. Battle.net fürs Update). */
  openPlatformLauncher: (platform: string): Promise<boolean> =>
    ipcRenderer.invoke('platform:open-launcher', platform),

  /** Laufendes Spiel schließen. */
  closeGame: (gameId: number): Promise<boolean> => ipcRenderer.invoke('game:close', gameId),

  /** Abonniert die Live-Liste laufender Spiele. Gibt eine Abmelde-Funktion zurück. */
  onTrackerUpdate: (cb: (running: RunningGame[]) => void): (() => void) => {
    const handler = (_e: unknown, data: RunningGame[]): void => cb(data)
    ipcRenderer.on('tracker:update', handler)
    return () => ipcRenderer.removeListener('tracker:update', handler)
  },

  /** Wird ausgelöst, wenn sich Spielzeiten geändert haben (Liste neu laden). */
  onGamesRefresh: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('games:refresh', handler)
    return () => ipcRenderer.removeListener('games:refresh', handler)
  },

  /** Phase 6: installierte Geräte + Treiberversionen auslesen. */
  getDevices: (): Promise<DeviceInfo[]> => ipcRenderer.invoke('system:devices'),

  /** Phase 6: Update-Prüfung für eine Nvidia-GPU. */
  checkNvidiaUpdate: (name: string, driverVersion: string): Promise<NvidiaUpdate> =>
    ipcRenderer.invoke('nvidia:check', { name, driverVersion }),

  /** Phase 6: NVIDIA App öffnen (true, wenn gefunden & gestartet). */
  openNvidiaApp: (): Promise<boolean> => ipcRenderer.invoke('nvidia:open-app'),

  /** Phase 3: Update-Historie laden (optional nur für ein Spiel). */
  getUpdateHistory: (gameId?: number): Promise<UpdateEvent[]> =>
    ipcRenderer.invoke('updates:history', gameId),

  /** Spielzeit-Startwert manuell setzen (Sekunden). Gibt die frische Spieleliste zurück. */
  setImportedPlaytime: (gameId: number, seconds: number): Promise<GameCard[]> =>
    ipcRenderer.invoke('game:set-playtime', { gameId, seconds }),

  /** Phase 4: WoT-Mod-Management. */
  getWotStatus: (): Promise<WotStatus> => ipcRenderer.invoke('wot:status'),
  toggleWotMod: (id: number, enable: boolean): Promise<WotStatus> =>
    ipcRenderer.invoke('wot:toggle', { id, enable }),
  restoreWotMods: (): Promise<WotStatus> => ipcRenderer.invoke('wot:restore'),
  addWotMods: (): Promise<WotStatus> => ipcRenderer.invoke('wot:add'),
  openWotModsFolder: (): Promise<void> => ipcRenderer.invoke('wot:open-folder'),

  /** Phase 5: Minecraft-Profile/Modpacks aller Launcher. */
  getMcProfiles: (): Promise<McProfile[]> => ipcRenderer.invoke('mc:profiles'),
  openMcFolder: (path: string): Promise<void> => ipcRenderer.invoke('mc:open-folder', path),

  /** Konten: Epic-Verbindung verwalten. */
  getEpicStatus: (): Promise<EpicAccountStatus> => ipcRenderer.invoke('epic:status'),
  openEpicLogin: (): Promise<void> => ipcRenderer.invoke('epic:open-login'),
  epicLogin: (
    code: string
  ): Promise<{ ok: true; status: EpicAccountStatus } | { ok: false; error: string }> =>
    ipcRenderer.invoke('epic:login', code),
  epicLogout: (): Promise<EpicAccountStatus> => ipcRenderer.invoke('epic:logout'),
  syncEpicPlaytime: (): Promise<EpicSyncResult> => ipcRenderer.invoke('epic:sync-playtime'),

  /** Shops: Gratisspiele, komplette Epic-Bibliothek, Steam-Angebote. */
  getEpicFreeGames: (): Promise<EpicFreeGame[]> => ipcRenderer.invoke('epic:free-games'),
  getEpicLibrary: (): Promise<EpicLibraryResult> => ipcRenderer.invoke('epic:library'),
  getSteamOffers: (): Promise<SteamOffer[]> => ipcRenderer.invoke('steam:offers'),

  /** Detailseiten: Store-Infos, News/Patchnotes und Erfolge zu einem Spiel.
   *  Per GameRef (Plattform+ID+Name) — funktioniert auch für nicht installierte. */
  getGameDetails: (ref: GameRef): Promise<GameDetails> =>
    ipcRenderer.invoke('game:details', ref),
  getGameNews: (ref: GameRef): Promise<GameNewsItem[]> => ipcRenderer.invoke('game:news', ref),
  getGameAchievements: (ref: GameRef): Promise<AchievementsResult> =>
    ipcRenderer.invoke('game:achievements', ref),

  /** Steam-Web-API-Key (für Erfolge) verwalten. */
  getSteamKeyStatus: (): Promise<SteamKeyStatus> => ipcRenderer.invoke('steamkey:status'),
  setSteamKey: (
    key: string
  ): Promise<{ ok: true; status: SteamKeyStatus } | { ok: false; error: string }> =>
    ipcRenderer.invoke('steamkey:set', key),
  clearSteamKey: (): Promise<SteamKeyStatus> => ipcRenderer.invoke('steamkey:clear'),

  /** SteamGridDB-Key (für bessere Cover) verwalten. */
  getSgdbStatus: (): Promise<SgdbStatus> => ipcRenderer.invoke('sgdb:status'),
  setSgdbKey: (
    key: string
  ): Promise<{ ok: true; upgradedCovers: number } | { ok: false; error: string }> =>
    ipcRenderer.invoke('sgdb:set', key),
  clearSgdbKey: (): Promise<SgdbStatus> => ipcRenderer.invoke('sgdb:clear'),

  /** Speicherplatz-Analyse: gecachter Stand und komplette Neuberechnung. */
  getGameStorage: (): Promise<GameStorageInfo[]> => ipcRenderer.invoke('storage:list'),
  analyzeGameStorage: (): Promise<GameStorageInfo[]> => ipcRenderer.invoke('storage:analyze'),
  computeGameSize: (gameId: number): Promise<number | null> =>
    ipcRenderer.invoke('storage:game', gameId),

  /** Meldet während der Analyse jedes fertig berechnete Spiel einzeln. */
  onStorageProgress: (cb: (info: GameStorageInfo) => void): (() => void) => {
    const handler = (_e: unknown, info: GameStorageInfo): void => cb(info)
    ipcRenderer.on('storage:progress', handler)
    return () => ipcRenderer.removeListener('storage:progress', handler)
  },

  /** Wunschliste mit Preisalarm. */
  getWishlist: (): Promise<WishlistItem[]> => ipcRenderer.invoke('wishlist:list'),
  addToWishlist: (item: {
    appId: string
    name: string
    coverUrl: string | null
    shop?: 'steam' | 'epic'
    storeUrl?: string | null
  }): Promise<WishlistItem[]> => ipcRenderer.invoke('wishlist:add', item),
  removeFromWishlist: (appId: string): Promise<WishlistItem[]> =>
    ipcRenderer.invoke('wishlist:remove', appId),
  checkWishlistPrices: (): Promise<WishlistItem[]> => ipcRenderer.invoke('wishlist:check'),
  importSteamWishlist: (): Promise<{
    ok: boolean
    imported: number
    total: number
    error?: string
  }> => ipcRenderer.invoke('wishlist:import-steam'),

  /** Meldet sich, wenn die regelmäßige Preisprüfung neue Daten hat. */
  onWishlistRefresh: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('wishlist:refresh', handler)
    return () => ipcRenderer.removeListener('wishlist:refresh', handler)
  },

  /** Steam-Store-Suche (zum Befüllen der Wunschliste). */
  searchSteamStore: (term: string): Promise<SteamSearchResult[]> =>
    ipcRenderer.invoke('steam:search', term),

  /** Epic-Store-Suche (zum Befüllen der Wunschliste). */
  searchEpicStore: (
    term: string
  ): Promise<{ ok: true; results: EpicSearchResult[] } | { ok: false; error: string }> =>
    ipcRenderer.invoke('epic:search', term),

  /** Preis-Infos zu einem Spiel (Steam + IsThereAnyDeal). */
  getGamePrices: (ref: GameRef): Promise<GamePriceInfo> =>
    ipcRenderer.invoke('game:prices', ref),

  /** IsThereAnyDeal-Key verwalten. */
  getItadStatus: (): Promise<ItadStatus> => ipcRenderer.invoke('itad:status'),
  setItadKey: (key: string): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke('itad:set', key),
  clearItadKey: (): Promise<ItadStatus> => ipcRenderer.invoke('itad:clear')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}

export type AppApi = typeof api
