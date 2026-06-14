import { app, shell, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { spawn } from 'child_process'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import {
  initDatabase,
  getDatabase,
  getLauncherTarget,
  listGames,
  getCoverPath,
  getLaunchInfo,
  listUpdateEvents,
  setImportedPlaytime
} from './db'
import type { GameRef } from '@shared/types'
import { scanLibrary } from './services/library'
import { listNotInstalledGames } from './services/notinstalled'
import { startTracker, closeGame } from './services/tracker'
import { readDevices } from './services/system/drivers'
import { checkNvidiaUpdate } from './services/system/nvidia'
import {
  addWotMods,
  getWotStatus,
  openWotModsFolder,
  restoreWotMods,
  toggleWotMod
} from './services/wot'
import { listMcProfiles } from './services/minecraft'
import {
  EPIC_LOGIN_URL,
  epicAccountStatus,
  epicLoginWithCode,
  epicLogout,
  syncEpicPlaytime
} from './services/epic/account'
import { getEpicFreeGames } from './services/epic/store'
import { searchEpicStore } from './services/epic/search'
import { getEpicLibrary } from './services/epic/library'
import { getSteamOffers } from './services/steam/offers'
import { getGameDetails, getGameNews, getGamePrices } from './services/gamedetails'
import { checkWishlistPrices, importSteamWishlist, searchSteamStore } from './services/wishlist'
import { itadStatus, setItadKey, clearItadKey } from './services/itad'
import { addWishlistItem, listWishlist, removeWishlistItem } from './db'
import { getGameAchievements } from './services/steam/achievements'
import { steamKeyStatus, setSteamApiKey, clearSteamApiKey } from './services/steam/webapi'
import { sgdbStatus, setSgdbKey, clearSgdbKey, upgradeWikiCovers } from './services/sgdb'
import { COVER_PLATFORMS } from './services/covers'
import { analyzeGameStorage, computeGameSize, listGameStorage } from './services/storage'

// Referenz aufs Hauptfenster, damit der Wächter Live-Updates schicken kann.
let mainWindow: BrowserWindow | null = null

// Datenordner fest auf %APPDATA%\spiele-hub legen. Ohne das würde die
// installierte App (productName "Spiele Hub") einen ANDEREN Ordner nutzen
// als der Dev-Modus (name "spiele-hub") — und alle Spielzeiten "verlieren".
app.setPath('userData', join(app.getPath('appData'), 'spiele-hub'))

// Nur eine Instanz zulassen: Dev-Modus und installierte App teilen sich die
// Datenbank; zwei gleichzeitige Wächter würden doppelte Sitzungen schreiben.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

// Das cover://-Schema MUSS registriert werden, BEVOR die App bereit ist.
// "secure/standard" sorgt dafür, dass es wie https behandelt wird und in <img> erlaubt ist.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'cover',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow = win

  win.on('ready-to-show', () => win.show())
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Auto-Update: beim Start (und danach alle 6 h) auf GitHub nach einer neueren
// Version schauen. Gefundene Updates werden STILL heruntergeladen; installiert
// wird erst, wenn der Nutzer in der App auf "Neu starten" klickt (oder beim
// nächsten normalen Beenden). Im Dev-Modus gibt es nichts zu updaten.
function setupAutoUpdater(): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:update-ready', info.version)
    }
  })
  autoUpdater.on('error', () => {}) // offline o. ä. — still ignorieren
  const check = (): void => {
    autoUpdater.checkForUpdates().catch(() => {})
  }
  check()
  setInterval(check, 6 * 60 * 60 * 1000)
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.spielehub.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 1) Datenbank hochfahren.
  initDatabase()

  // 2) cover://<platform>/<platformId> -> liefert das lokale Cover-Bild aus.
  //    Der Renderer kann so <img src="cover://steam/440"> nutzen, ohne direkten
  //    Dateisystem-Zugriff zu haben.
  protocol.handle('cover', async (request) => {
    const url = new URL(request.url)
    const platform = url.hostname
    const platformId = decodeURIComponent(url.pathname.replace(/^\//, ''))
    const filePath = getCoverPath(platform, platformId)
    if (filePath && existsSync(filePath)) {
      return net.fetch(pathToFileURL(filePath).toString())
    }
    return new Response('Cover nicht gefunden', { status: 404 })
  })

  // 3) IPC-Endpunkte für den Renderer.
  ipcMain.handle('app:db-status', () => {
    const db = getDatabase()
    const row = db.prepare('SELECT COUNT(*) AS count FROM games').get() as { count: number }
    return { ok: true, gameCount: row.count, dbPath: db.name }
  })

  // App-Version anzeigen + heruntergeladenes Update auf Klick installieren.
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:install-update', () => autoUpdater.quitAndInstall())

  ipcMain.handle('library:scan', () => scanLibrary())
  ipcMain.handle('games:list', () => listGames())
  ipcMain.handle('games:not-installed', () => listNotInstalledGames())

  // Starten: je nach Eintrag eine URL (Steam/Epic) im jeweiligen Client öffnen
  // oder eine exe direkt starten (Launcher). Die Zeitmessung macht der Wächter.
  // Ein Start-Ziel ausführen: spawn:-JSON (exe + Argumente), URL oder exe-Pfad.
  const executeLaunchTarget = (target: string | null): boolean => {
    if (!target) return false
    if (target.startsWith('spawn:')) {
      // Programm mit Argumenten starten (z. B. Battle.net --exec="launch WTCG").
      try {
        const { exe, args } = JSON.parse(target.slice(6)) as { exe: string; args?: string[] }
        spawn(exe, args ?? [], { detached: true, stdio: 'ignore' }).unref()
        return true
      } catch {
        return false
      }
    }
    if (target.includes('://')) {
      shell.openExternal(target) // steam:// oder com.epicgames.launcher://
    } else {
      shell.openPath(target) // exe-Pfad (Launcher)
    }
    return true
  }

  ipcMain.handle('game:launch', (_e, id: number) => {
    const info = getLaunchInfo(id)
    if (!info) return { ok: false }
    const ok = info.launchTarget
      ? executeLaunchTarget(info.launchTarget)
      : executeLaunchTarget(`steam://rungameid/${info.platformId}`) // Rückfall
    return { ok }
  })

  // Den Launcher einer Plattform öffnen (z. B. Battle.net fürs Spiel-Update).
  ipcMain.handle('platform:open-launcher', (_e, platform: string) =>
    executeLaunchTarget(getLauncherTarget(platform))
  )

  // Spiel schließen: alle Prozesse im Installationsordner beenden.
  ipcMain.handle('game:close', (_e, gameId: number) => closeGame(gameId))

  // Phase 3: Update-Historie (alle Spiele oder ein einzelnes).
  ipcMain.handle('updates:history', (_e, gameId?: number) => listUpdateEvents(gameId))

  // Spielzeit-Startwert manuell setzen (für Epic-Spiele, deren Zeit nur online liegt).
  ipcMain.handle('game:set-playtime', (_e, args: { gameId: number; seconds: number }) => {
    setImportedPlaytime(args.gameId, args.seconds)
    return listGames()
  })

  // Phase 3: alle 10 Minuten still neu scannen, damit neue Updates ohne
  // manuelles Aktualisieren erkannt werden. Renderer wird benachrichtigt.
  setInterval(
    () => {
      scanLibrary()
        .then(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('games:refresh')
          }
        })
        .catch(() => {})
    },
    10 * 60 * 1000
  )

  // Phase 5: Minecraft-Profile/Modpacks (nur lesend).
  ipcMain.handle('mc:profiles', () => listMcProfiles())
  ipcMain.handle('mc:open-folder', (_e, path: string) => {
    if (existsSync(path)) shell.openPath(path)
  })

  // Phase 4: World-of-Tanks-Mod-Management.
  ipcMain.handle('wot:status', () => getWotStatus())
  ipcMain.handle('wot:toggle', (_e, args: { id: number; enable: boolean }) =>
    toggleWotMod(args.id, args.enable)
  )
  ipcMain.handle('wot:restore', () => restoreWotMods())
  ipcMain.handle('wot:add', () => addWotMods())
  ipcMain.handle('wot:open-folder', () => openWotModsFolder())

  // Konten: Epic-Konto verbinden, Status, Spielzeit-Abgleich.
  ipcMain.handle('epic:status', () => epicAccountStatus())
  ipcMain.handle('epic:open-login', () => shell.openExternal(EPIC_LOGIN_URL))
  ipcMain.handle('epic:login', async (_e, code: string) => {
    try {
      return { ok: true as const, status: await epicLoginWithCode(code) }
    } catch (err) {
      return { ok: false as const, error: String(err instanceof Error ? err.message : err) }
    }
  })
  ipcMain.handle('epic:logout', () => {
    epicLogout()
    return epicAccountStatus()
  })
  ipcMain.handle('epic:sync-playtime', async () => {
    const result = await syncEpicPlaytime()
    if (result.ok && result.updatedGames > 0 && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('games:refresh')
    }
    return result
  })

  // Shops: Epic-Gratisspiele (ohne Login), komplette Epic-Bibliothek
  // (mit Konto) und aktuelle Steam-Angebote (ohne Login).
  ipcMain.handle('epic:free-games', () => getEpicFreeGames())
  ipcMain.handle('epic:library', () => getEpicLibrary())
  ipcMain.handle('steam:offers', () => getSteamOffers())

  // Spiel-Detailseiten: Store-Infos, News/Patchnotes und Erfolge.
  ipcMain.handle('game:details', (_e, ref: GameRef) => getGameDetails(ref))
  ipcMain.handle('game:news', (_e, ref: GameRef) => getGameNews(ref))
  ipcMain.handle('game:achievements', (_e, ref: GameRef) => getGameAchievements(ref))

  // Steam-Web-API-Key (für Erfolge) verwalten.
  ipcMain.handle('steamkey:status', () => steamKeyStatus())
  ipcMain.handle('steamkey:set', (_e, key: string) => setSteamApiKey(key))
  ipcMain.handle('steamkey:clear', () => clearSteamApiKey())

  // SteamGridDB-Key (für bessere Cover) verwalten. Nach dem Hinterlegen werden
  // vorhandene Wikipedia-Logo-Cover direkt durch echte Box-Art ersetzt.
  ipcMain.handle('sgdb:status', () => sgdbStatus())
  ipcMain.handle('sgdb:set', async (_e, key: string) => {
    const result = await setSgdbKey(key)
    if (!result.ok) return result
    const upgraded = await upgradeWikiCovers(COVER_PLATFORMS)
    if (upgraded > 0 && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('games:refresh')
    }
    return { ok: true as const, upgradedCovers: upgraded }
  })
  ipcMain.handle('sgdb:clear', () => clearSgdbKey())

  // Wunschliste mit Preisalarm + Steam-Store-Suche + Preis-Infos.
  ipcMain.handle('wishlist:list', () => listWishlist())
  ipcMain.handle(
    'wishlist:add',
    async (
      _e,
      item: {
        appId: string
        name: string
        coverUrl: string | null
        shop?: 'steam' | 'epic'
        storeUrl?: string | null
      }
    ) => {
      addWishlistItem(item.appId, item.name, item.coverUrl, item.shop ?? 'steam', item.storeUrl ?? null)
      return checkWishlistPrices() // direkt den aktuellen Preis holen
    }
  )
  ipcMain.handle('wishlist:remove', (_e, appId: string) => {
    removeWishlistItem(appId)
    return listWishlist()
  })
  ipcMain.handle('wishlist:check', () => checkWishlistPrices())
  ipcMain.handle('wishlist:import-steam', async () => {
    const result = await importSteamWishlist()
    if (result.ok && result.imported > 0 && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('wishlist:refresh') // Glocke aktualisieren
    }
    return result
  })
  ipcMain.handle('steam:search', (_e, term: string) => searchSteamStore(term))
  ipcMain.handle('epic:search', (_e, term: string) => searchEpicStore(term))
  ipcMain.handle('game:prices', (_e, ref: GameRef) => getGamePrices(ref))

  // IsThereAnyDeal-Key (Preisvergleich/Tiefstpreise) verwalten.
  ipcMain.handle('itad:status', () => itadStatus())
  ipcMain.handle('itad:set', (_e, key: string) => setItadKey(key))
  ipcMain.handle('itad:clear', () => clearItadKey())

  // Preise beim Start und danach alle 6 h prüfen; die Glocke lädt dann neu.
  const checkPrices = (): void => {
    checkWishlistPrices()
      .then(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('wishlist:refresh')
        }
      })
      .catch(() => {})
  }
  checkPrices()
  setInterval(checkPrices, 6 * 60 * 60 * 1000)

  // Speicherplatz-Analyse: gecachter Stand, komplette Neuberechnung
  // (mit Live-Fortschritt pro Spiel) und Einzelberechnung für die Detailseite.
  ipcMain.handle('storage:list', () => listGameStorage())
  ipcMain.handle('storage:analyze', () =>
    analyzeGameStorage((info) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('storage:progress', info)
      }
    })
  )
  ipcMain.handle('storage:game', (_e, gameId: number) => computeGameSize(gameId))

  // Beim Start (falls verbunden) die Epic-Spielzeiten still abgleichen.
  if (epicAccountStatus().connected) {
    syncEpicPlaytime()
      .then((r) => {
        if (r.ok && r.updatedGames > 0 && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('games:refresh')
        }
      })
      .catch(() => {})
  }

  // Phase 6: installierte Geräte + Treiberversionen auslesen.
  ipcMain.handle('system:devices', () => readDevices())

  // Phase 6: Update-Prüfung für eine Nvidia-GPU (nur Anzeige, kein Installieren).
  ipcMain.handle('nvidia:check', (_e, args: { name: string; driverVersion: string }) =>
    checkNvidiaUpdate(args.name, args.driverVersion)
  )

  // Phase 6: die NVIDIA App öffnen (dort macht der Nutzer das Update selbst).
  ipcMain.handle('nvidia:open-app', () => {
    const candidates = [
      'C:\\Program Files\\NVIDIA Corporation\\NVIDIA App\\CEF\\NVIDIA App.exe',
      'C:\\Program Files\\NVIDIA Corporation\\NVIDIA App\\NVIDIA App.exe',
      'C:\\Program Files (x86)\\NVIDIA Corporation\\NVIDIA App\\CEF\\NVIDIA App.exe'
    ]
    const exe = candidates.find((c) => existsSync(c))
    if (exe) {
      shell.openPath(exe)
      return true
    }
    return false
  })

  // 4) Hintergrund-Wächter starten. Er schickt Live-Updates ans Fenster.
  startTracker((channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload)
    }
  })

  createWindow()
  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
