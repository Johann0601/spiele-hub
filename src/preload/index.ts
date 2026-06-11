import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  DeviceInfo,
  EpicAccountStatus,
  EpicSyncResult,
  GameCard,
  NvidiaUpdate,
  RunningGame,
  McProfile,
  ScanResult,
  UpdateEvent,
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

  /** Spiel/Launcher starten (per Eintrags-ID). */
  launchGame: (id: number): Promise<{ ok: boolean }> => ipcRenderer.invoke('game:launch', id),

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
  syncEpicPlaytime: (): Promise<EpicSyncResult> => ipcRenderer.invoke('epic:sync-playtime')
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
