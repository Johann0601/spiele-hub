import type React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  EpicFreeGame,
  GameCard,
  NotInstalledGame,
  NvidiaUpdate,
  Platform,
  RunningGame,
  WishlistItem
} from '@shared/types'
import { formatGameSize, formatLastPlayed, formatPlaytime } from './format'
import { platformLabel } from './platforms'
import { updateActionFor } from './updateAction'
import { uninstallActionFor } from './uninstallAction'
import logoUrl from './assets/logo.svg'
import GameDetailExtras from './GameDetailExtras'
import HomeView from './HomeView'
import ModsView from './ModsView'
import Onboarding from './Onboarding'
import NotificationsView from './NotificationsView'
import SettingsView from './SettingsView'
import ShopsView from './ShopsView'
import UpdatesView from './UpdatesView'

export type View =
  | 'home'
  | 'games'
  | 'updates'
  | 'mods'
  | 'shops'
  | 'notifications'
  | 'settings'
  | 'settings-accounts'
  | 'settings-system'
  | 'settings-changelog'

export type Theme = 'dark' | 'light'

// Die App-Hülle: schmale Seitenleiste links (klappt beim Drüberfahren aus),
// daneben die aktive Ansicht.
function App(): JSX.Element {
  const [view, setView] = useState<View>('home') // Startseite ist die erste Ansicht
  // Von der Startseite aus kann ein Spiel direkt in der Detailansicht geöffnet werden.
  const [gameToShow, setGameToShow] = useState<number | null>(null)
  const [appVersion, setAppVersion] = useState('')
  const [updateVersion, setUpdateVersion] = useState<string | null>(null) // fertig geladenes App-Update
  const [theme, setTheme] = useState<Theme>(() =>
    localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
  )
  // Erste-Schritte-Pop-up nur beim allerersten Start zeigen.
  const [showOnboarding, setShowOnboarding] = useState(
    () => localStorage.getItem('onboarding-done') !== '1'
  )
  const dismissOnboarding = (): void => {
    localStorage.setItem('onboarding-done', '1')
    setShowOnboarding(false)
  }

  // Daten für die Benachrichtigungs-Glocke: ausstehende Spiel-Updates,
  // Nvidia-Treiber, Wunschlisten-Rabatte und nicht eingelöste Epic-Gratisspiele.
  const [pendingGames, setPendingGames] = useState<GameCard[]>([])
  const [nvidia, setNvidia] = useState<NvidiaUpdate | null>(null)
  const [wishlistDeals, setWishlistDeals] = useState<WishlistItem[]>([])
  const [epicFreebies, setEpicFreebies] = useState<EpicFreeGame[]>([])
  const [dismissedFreebies, setDismissedFreebies] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('epic-free-dismissed') ?? '[]') as string[]
    } catch {
      return []
    }
  })

  const [refreshing, setRefreshing] = useState(false) // Glocke wird gerade neu geprüft

  // --- Lade-Funktionen der Glocke (wiederverwendbar, auch für „↻ Aktualisieren") ---

  // Wunschlisten-Rabatte aus der DB lesen (ohne neue Preisprüfung).
  const loadDeals = useCallback((): Promise<void> => {
    return window.api
      .getWishlist()
      .then((items) => setWishlistDeals(items.filter((i) => i.discountPct > 0)))
      .catch(() => {})
  }, [])

  // Ausstehende Spiel-Updates aus der (bereits gescannten) Bibliothek lesen.
  const loadPending = useCallback((): Promise<void> => {
    return window.api
      .listGames()
      .then((g) => setPendingGames(g.filter((x) => x.kind === 'game' && x.updatePending)))
      .catch(() => {})
  }, [])

  // Epic-Gratisspiele, die noch NICHT in der Bibliothek sind (braucht Konto).
  const loadFreebies = useCallback(async (): Promise<void> => {
    try {
      const [free, lib] = await Promise.all([
        window.api.getEpicFreeGames(),
        window.api.getEpicLibrary()
      ])
      if (!lib.ok) return // ohne verbundenes Konto keine Erinnerung
      const owned = new Set(lib.games.map((g) => g.title.toLowerCase().trim()))
      setEpicFreebies(
        free.filter((f) => f.status === 'gratis' && !owned.has(f.title.toLowerCase().trim()))
      )
    } catch {
      /* offline o. ä. */
    }
  }, [])

  // Nvidia-Treiber-Update prüfen (nur falls eine Nvidia-GPU steckt).
  const loadNvidia = useCallback(async (): Promise<void> => {
    try {
      const devices = await window.api.getDevices()
      const gpu = devices.find((d) => d.isNvidiaGpu)
      if (gpu) setNvidia(await window.api.checkNvidiaUpdate(gpu.name, gpu.driverVersion))
    } catch {
      /* keine Treiber-Benachrichtigung */
    }
  }, [])

  // „↻ Aktualisieren" in der Glocke: alle Prüfungen frisch anstoßen — inkl.
  // Bibliotheks-Scan (Update-Erkennung) und aktiver Wunschlisten-Preisprüfung.
  const refreshNotifications = useCallback(async (): Promise<void> => {
    setRefreshing(true)
    try {
      await window.api.scanLibrary().catch(() => {}) // frische Spiel-Update-Erkennung
      await Promise.all([
        loadPending(),
        window.api
          .checkWishlistPrices()
          .then((items) => setWishlistDeals(items.filter((i) => i.discountPct > 0)))
          .catch(() => {}),
        loadFreebies(),
        loadNvidia()
      ])
    } finally {
      setRefreshing(false)
    }
  }, [loadPending, loadFreebies, loadNvidia])

  // Erstes Laden + Live-Auffrischung über die Hintergrund-Ereignisse.
  useEffect(() => {
    loadDeals()
    return window.api.onWishlistRefresh(loadDeals) // nach jeder Preisprüfung
  }, [loadDeals])

  useEffect(() => {
    loadFreebies()
  }, [loadFreebies])

  useEffect(() => {
    window.api.getAppVersion().then(setAppVersion).catch(() => {})
    return window.api.onAppUpdateReady(setUpdateVersion)
  }, [])

  useEffect(() => {
    loadPending()
    const off = window.api.onGamesRefresh(loadPending) // nach jedem Hintergrund-Scan
    loadNvidia()
    return off
  }, [loadPending, loadNvidia])

  const visibleFreebies = epicFreebies.filter((f) => !dismissedFreebies.includes(f.title))
  const dismissFreebie = (title: string): void => {
    setDismissedFreebies((prev) => {
      const next = [...prev, title]
      localStorage.setItem('epic-free-dismissed', JSON.stringify(next))
      return next
    })
  }

  const notifCount =
    (updateVersion ? 1 : 0) +
    pendingGames.length +
    (nvidia?.updateAvailable ? 1 : 0) +
    wishlistDeals.length +
    visibleFreebies.length

  // Theme als Attribut ans Wurzel-Element — das CSS schaltet darüber um.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  const inSettings = view.startsWith('settings')

  return (
    <div className="shell">
      <nav className="sidebar">
        <button
          className={`sidebar-brand ${view === 'home' ? 'active' : ''}`}
          onClick={() => setView('home')}
          title="Zur Startseite"
        >
          <img className="brand-mark" src={logoUrl} alt="" />
          <span className="brand-text nav-label">
            buff<span className="brand-text-accent">d</span>
          </span>
        </button>
        <button
          className={`nav-item ${view === 'games' ? 'active' : ''}`}
          onClick={() => {
            setGameToShow(null) // normaler Einstieg: Übersicht, keine Detailansicht
            setView('games')
          }}
          title="Spiele"
        >
          <span className="nav-icon">🎮</span>
          <span className="nav-label">Spiele</span>
        </button>
        <button
          className={`nav-item ${view === 'updates' ? 'active' : ''}`}
          onClick={() => setView('updates')}
          title="Updates"
        >
          <span className="nav-icon">⬆️</span>
          <span className="nav-label">Updates</span>
        </button>
        <button
          className={`nav-item ${view === 'mods' ? 'active' : ''}`}
          onClick={() => setView('mods')}
          title="Mods"
        >
          <span className="nav-icon">🧩</span>
          <span className="nav-label">Mods</span>
        </button>
        <button
          className={`nav-item ${view === 'shops' ? 'active' : ''}`}
          onClick={() => setView('shops')}
          title="Shops"
        >
          <span className="nav-icon">🛒</span>
          <span className="nav-label">Shops</span>
        </button>

        <button
          className={`nav-item nav-bottom ${view === 'notifications' ? 'active' : ''}`}
          onClick={() => setView('notifications')}
          title="Benachrichtigungen"
        >
          <span className="nav-icon">
            🔔
            {notifCount > 0 && <span className="nav-badge">{notifCount}</span>}
          </span>
          <span className="nav-label">Benachrichtigungen</span>
        </button>
        <button
          className={`nav-item ${inSettings ? 'active' : ''}`}
          onClick={() => setView('settings')}
          title="Einstellungen"
        >
          <span className="nav-icon">⚙️</span>
          <span className="nav-label">Einstellungen</span>
        </button>
        <div className="sidebar-footer">
          {appVersion && <span className="app-version nav-label">Version {appVersion}</span>}
        </div>
      </nav>
      <div className="shell-content">
        {view === 'home' && (
          <HomeView
            onNavigate={setView}
            onOpenGame={(id) => {
              setGameToShow(id)
              setView('games')
            }}
          />
        )}
        {view === 'games' && <GamesView initialSelectedId={gameToShow} />}
        {view === 'updates' && <UpdatesView />}
        {view === 'mods' && <ModsView />}
        {view === 'shops' && <ShopsView />}
        {view === 'notifications' && (
          <NotificationsView
            appUpdateVersion={updateVersion}
            pendingGames={pendingGames}
            nvidia={nvidia}
            wishlistDeals={wishlistDeals}
            epicFreebies={visibleFreebies}
            onDismissFreebie={dismissFreebie}
            onRefresh={refreshNotifications}
            refreshing={refreshing}
          />
        )}
        {inSettings && (
          <SettingsView view={view} onNavigate={setView} theme={theme} onThemeChange={setTheme} />
        )}
      </div>

      {showOnboarding && (
        <Onboarding
          onClose={dismissOnboarding}
          onOpenAccounts={() => setView('settings-accounts')}
        />
      )}
    </div>
  )
}

// Sortier-Möglichkeiten der Spiele-Seite.
type GameSort = 'playtime' | 'lastPlayed' | 'name' | 'size'

const SORT_OPTIONS: { value: GameSort; label: string }[] = [
  { value: 'playtime', label: 'Spielzeit' },
  { value: 'lastPlayed', label: 'Zuletzt gespielt' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'size', label: 'Größe' }
]

// Sortierung der Sektion „Nicht installiert" (kein „Größe", da nicht installiert).
type NiSort = 'lastPlayed' | 'playtime' | 'name'

const NI_SORT_OPTIONS: { value: NiSort; label: string }[] = [
  { value: 'lastPlayed', label: 'Zuletzt gespielt' },
  { value: 'playtime', label: 'Spielzeit' },
  { value: 'name', label: 'Name (A–Z)' }
]

function GamesView({
  initialSelectedId = null
}: {
  initialSelectedId?: number | null
}): JSX.Element {
  const [games, setGames] = useState<GameCard[]>([])
  const [running, setRunning] = useState<Map<number, number>>(new Map()) // gameId -> startedAt
  const [selectedId, setSelectedId] = useState<number | null>(initialSelectedId)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  // Suche, Plattform-Filter und Sortierung (Filter + Sortierung werden gemerkt).
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState<string>(
    () => localStorage.getItem('games-filter-platform') ?? 'all'
  )
  const [sortBy, setSortBy] = useState<GameSort>(() => {
    const saved = localStorage.getItem('games-sort')
    return SORT_OPTIONS.some((o) => o.value === saved) ? (saved as GameSort) : 'playtime'
  })
  // Tag-Filter (Steam-Community-Tags), mehrfach wählbar — wird gemerkt.
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('games-filter-tags') ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const [tagsOpen, setTagsOpen] = useState(false)
  useEffect(() => {
    localStorage.setItem('games-filter-tags', JSON.stringify(selectedTags))
  }, [selectedTags])
  // Nicht installierte Spiele (Besitz-Katalog) — separat geladen, damit die
  // Seite sofort steht und der (teils langsame) Katalog-Abruf nachrückt.
  const [notInstalled, setNotInstalled] = useState<NotInstalledGame[] | null>(null)
  const [selectedNi, setSelectedNi] = useState<NotInstalledGame | null>(null) // offene NI-Detailseite
  const [niInfo, setNiInfo] = useState<{
    steamKeyMissing: boolean
    steamLoaded: boolean
    epicConnected: boolean
  } | null>(null)
  // Eigene Suche/Filter/Sortierung für die Sektion „Nicht installiert".
  const [niSearch, setNiSearch] = useState('')
  const [niPlatformFilter, setNiPlatformFilter] = useState<string>(
    () => localStorage.getItem('ni-filter-platform') ?? 'all'
  )
  const [niSort, setNiSort] = useState<NiSort>(() => {
    const saved = localStorage.getItem('ni-sort')
    return NI_SORT_OPTIONS.some((o) => o.value === saved) ? (saved as NiSort) : 'lastPlayed'
  })

  useEffect(() => {
    localStorage.setItem('games-filter-platform', platformFilter)
  }, [platformFilter])
  useEffect(() => {
    localStorage.setItem('games-sort', sortBy)
  }, [sortBy])
  useEffect(() => {
    localStorage.setItem('ni-filter-platform', niPlatformFilter)
  }, [niPlatformFilter])
  useEffect(() => {
    localStorage.setItem('ni-sort', niSort)
  }, [niSort])

  const reloadGames = useCallback(async () => {
    try {
      setGames(await window.api.listGames())
    } catch {
      /* ignorieren */
    }
  }, [])

  // Besitz-Katalog laden (Steam + Epic + DB-Reste). Eigener Aufruf, weil der
  // Netz-Abruf je nach Bibliotheksgröße ein paar Sekunden dauern kann.
  const loadNotInstalled = useCallback(async () => {
    setNotInstalled(null)
    try {
      const res = await window.api.listNotInstalledGames()
      setNotInstalled(res.ok ? res.games : [])
      setNiInfo({
        steamKeyMissing: res.steamKeyMissing,
        steamLoaded: res.steamLoaded,
        epicConnected: res.epicConnected
      })
    } catch {
      setNotInstalled([])
    }
  }, [])

  const scan = useCallback(async () => {
    setScanning(true)
    setError(null)
    try {
      const result = await window.api.scanLibrary()
      if (!result.ok) setError(result.error ?? 'Scan fehlgeschlagen.')
      else setGames(result.games)
    } catch (err) {
      setError(String(err))
    } finally {
      setScanning(false)
      loadNotInstalled() // nach dem Scan stimmt die „installiert"-Liste -> Katalog auffrischen
      // Steam-Community-Tags im Hintergrund nachladen (gedrosselt); meldet sich
      // per onGamesRefresh, sobald neue Tags da sind.
      window.api.ensureGameTags().catch(() => {})
    }
  }, [loadNotInstalled])

  // Start: Liste laden, scannen, und auf Wächter-Updates hören.
  useEffect(() => {
    reloadGames()
    scan()
    const offTracker = window.api.onTrackerUpdate((list: RunningGame[]) => {
      setRunning(new Map(list.map((r) => [r.gameId, r.startedAt])))
    })
    const offRefresh = window.api.onGamesRefresh(() => reloadGames())
    return () => {
      offTracker()
      offRefresh()
    }
  }, [reloadGames, scan])

  // Sekundentakt für die Live-Spielzeit — nur wenn etwas läuft.
  useEffect(() => {
    if (running.size === 0) return
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [running])

  // Gesamt-Spielzeit inkl. der aktuell laufenden Sitzung (live).
  const liveTotal = useCallback(
    (game: GameCard): number => {
      const startedAt = running.get(game.id)
      const live = startedAt ? Math.max(0, now - startedAt) : 0
      return game.totalPlaytimeSec + live
    },
    [running, now]
  )

  const selected = useMemo(
    () => games.find((g) => g.id === selectedId) ?? null,
    [games, selectedId]
  )

  // Launcher und echte Spiele getrennt darstellen.
  const launchers = useMemo(() => games.filter((g) => g.kind === 'launcher'), [games])
  const playable = useMemo(() => games.filter((g) => g.kind === 'game'), [games])

  // Nur Plattformen anbieten, von denen es auch Spiele gibt.
  const availablePlatforms = useMemo(
    () => [...new Set(playable.map((g) => g.platform))] as Platform[],
    [playable]
  )

  // Alle vorhandenen Tags (häufigste zuerst) für die Filterauswahl.
  const availableTags = useMemo(() => {
    const freq = new Map<string, number>()
    for (const g of playable) for (const t of g.tags) freq.set(t, (freq.get(t) ?? 0) + 1)
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))
      .map(([t]) => t)
  }, [playable])

  const toggleTag = useCallback((tag: string): void => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }, [])

  // Suche + Filter + Sortierung anwenden.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = playable.filter(
      (g) =>
        (platformFilter === 'all' || g.platform === platformFilter) &&
        (term === '' || g.name.toLowerCase().includes(term)) &&
        (selectedTags.length === 0 || selectedTags.every((t) => g.tags.includes(t)))
    )
    switch (sortBy) {
      case 'name':
        list.sort((a, b) => a.name.localeCompare(b.name, 'de'))
        break
      case 'lastPlayed':
        list.sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
        break
      case 'size':
        list.sort((a, b) => (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1))
        break
      default: // Spielzeit (wie bisher)
        list.sort((a, b) => liveTotal(b) - liveTotal(a))
    }
    return list
  }, [playable, search, platformFilter, sortBy, selectedTags, liveTotal])

  // Plattformen, von denen es nicht installierte Spiele gibt.
  const niAvailablePlatforms = useMemo(
    () => [...new Set((notInstalled ?? []).map((g) => g.source))] as Platform[],
    [notInstalled]
  )

  // Nicht installierte Spiele: eigene Suche + Plattform-Filter + Sortierung.
  const visibleNotInstalled = useMemo(() => {
    if (!notInstalled) return []
    const term = niSearch.trim().toLowerCase()
    const list = notInstalled.filter(
      (g) =>
        (niPlatformFilter === 'all' || g.source === niPlatformFilter) &&
        (term === '' || g.name.toLowerCase().includes(term))
    )
    switch (niSort) {
      case 'name':
        list.sort((a, b) => a.name.localeCompare(b.name, 'de'))
        break
      case 'playtime':
        list.sort((a, b) => b.playtimeSec - a.playtimeSec)
        break
      default: // zuletzt gespielt (mit Spielzeit/Name als Gleichstand-Auflösung)
        list.sort(
          (a, b) =>
            (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) ||
            b.playtimeSec - a.playtimeSec ||
            a.name.localeCompare(b.name, 'de')
        )
    }
    return list
  }, [notInstalled, niSearch, niPlatformFilter, niSort])

  if (selected) {
    return (
      <GameDetail
        game={selected}
        isRunning={running.has(selected.id)}
        liveTotalSec={liveTotal(selected)}
        onBack={() => setSelectedId(null)}
        onGamesUpdated={setGames}
      />
    )
  }

  if (selectedNi) {
    return <NotInstalledDetail game={selectedNi} onBack={() => setSelectedNi(null)} />
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1 className="brand-title">
            <img className="brand-title-mark" src={logoUrl} alt="" />
            buffd
          </h1>
          <span className="subtitle">{playable.length} Spiele</span>
        </div>
        <button className="btn" onClick={scan} disabled={scanning}>
          {scanning ? 'Scanne …' : '↻ Aktualisieren'}
        </button>
      </header>

      <main className="content">
        {error && <div className="banner error">⚠ {error}</div>}
        {games.length === 0 && !scanning && !error && (
          <div className="empty">Nichts gefunden. Klicke auf „Aktualisieren".</div>
        )}

        {launchers.length > 0 && (
          <section className="launcher-section">
            <h2 className="section-title">Launcher</h2>
            <div className="launcher-bar">
              {launchers.map((l) => (
                <LauncherChip key={l.id} launcher={l} onLaunch={() => window.api.launchGame(l.id)} />
              ))}
            </div>
          </section>
        )}

        {playable.length > 0 && (
          <div className="games-head">
            <h2 className="section-title">
              Spiele
              {visible.length !== playable.length && (
                <span className="games-count">
                  {' '}
                  ({visible.length} von {playable.length})
                </span>
              )}
            </h2>
            <div className="games-toolbar">
              <input
                type="text"
                className="toolbar-input"
                placeholder="🔍 Spiel suchen …"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="toolbar-select"
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                title="Nach Plattform filtern"
              >
                <option value="all">Alle Plattformen</option>
                {availablePlatforms.map((p) => (
                  <option key={p} value={p}>
                    {platformLabel(p)}
                  </option>
                ))}
              </select>
              <select
                className="toolbar-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as GameSort)}
                title="Sortierung"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    Sortieren: {o.label}
                  </option>
                ))}
              </select>
              {availableTags.length > 0 && (
                <button
                  className={`toolbar-select tag-toggle ${selectedTags.length ? 'active' : ''}`}
                  onClick={() => setTagsOpen((o) => !o)}
                  title="Nach Steam-Tags filtern"
                >
                  🏷 Tags{selectedTags.length > 0 ? ` (${selectedTags.length})` : ''}
                </button>
              )}
            </div>
          </div>
        )}
        {playable.length > 0 && tagsOpen && availableTags.length > 0 && (
          <div className="tag-filter-panel">
            {availableTags.map((t) => (
              <button
                key={t}
                className={`tag-chip ${selectedTags.includes(t) ? 'on' : ''}`}
                onClick={() => toggleTag(t)}
              >
                {t}
              </button>
            ))}
            {selectedTags.length > 0 && (
              <button className="tag-chip clear" onClick={() => setSelectedTags([])}>
                ✕ zurücksetzen
              </button>
            )}
          </div>
        )}
        {playable.length > 0 && visible.length === 0 && (
          <div className="empty">Kein Spiel passt zu Suche/Filter.</div>
        )}
        <div className="grid">
          {visible.map((game) => (
            <GameTile
              key={game.id}
              game={game}
              isRunning={running.has(game.id)}
              liveTotalSec={liveTotal(game)}
              onClick={() => setSelectedId(game.id)}
            />
          ))}
        </div>

        {/* Nicht installierte Spiele (Besitz-Katalog) */}
        {notInstalled === null ? (
          <div className="ni-loading">Lade nicht installierte Spiele …</div>
        ) : (
          (notInstalled.length > 0 || niInfo) && (
            <section className="ni-section">
              <div className="games-head">
                <h2 className="section-title">
                  Nicht installiert
                  <span className="games-count">
                    {' '}
                    ({visibleNotInstalled.length}
                    {notInstalled.length !== visibleNotInstalled.length
                      ? ` von ${notInstalled.length}`
                      : ''}
                    )
                  </span>
                </h2>
                {notInstalled.length > 0 && (
                  <div className="games-toolbar">
                    <input
                      type="text"
                      className="toolbar-input"
                      placeholder="🔍 Spiel suchen …"
                      value={niSearch}
                      onChange={(e) => setNiSearch(e.target.value)}
                    />
                    <select
                      className="toolbar-select"
                      value={niPlatformFilter}
                      onChange={(e) => setNiPlatformFilter(e.target.value)}
                      title="Nach Plattform filtern"
                    >
                      <option value="all">Alle Plattformen</option>
                      {niAvailablePlatforms.map((p) => (
                        <option key={p} value={p}>
                          {platformLabel(p)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="toolbar-select"
                      value={niSort}
                      onChange={(e) => setNiSort(e.target.value as NiSort)}
                      title="Sortierung"
                    >
                      {NI_SORT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          Sortieren: {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {niInfo &&
                (() => {
                  const hints: string[] = []
                  if (niInfo.steamKeyMissing)
                    hints.push('Steam-Web-API-Key hinterlegen (Einstellungen → Konten)')
                  else if (!niInfo.steamLoaded)
                    hints.push(
                      'deine Steam-Spieldetails auf „öffentlich" stellen (sonst bleibt der Steam-Katalog leer)'
                    )
                  if (!niInfo.epicConnected)
                    hints.push('Epic-Konto verbinden (Einstellungen → Konten)')
                  return hints.length > 0 ? (
                    <div className="ni-hint">
                      ℹ Für den vollständigen Katalog: {hints.join(' · ')}.
                    </div>
                  ) : null
                })()}
              {visibleNotInstalled.length === 0 ? (
                <div className="empty">
                  {notInstalled.length === 0
                    ? 'Alle bekannten Spiele sind installiert.'
                    : 'Kein Spiel passt zu Suche/Filter.'}
                </div>
              ) : (
                <div className="grid">
                  {visibleNotInstalled.map((game) => (
                    <NotInstalledTile
                      key={`${game.source}:${game.platformId}`}
                      game={game}
                      onClick={() => setSelectedNi(game)}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        )}
      </main>
    </div>
  )
}

/** Eine Kachel für ein besessenes, aber nicht installiertes Spiel. */
function NotInstalledTile({
  game,
  onClick
}: {
  game: NotInstalledGame
  onClick: () => void
}): JSX.Element {
  const [failed, setFailed] = useState(false)
  const isLogo =
    !!game.coverUrl &&
    (game.coverUrl.includes('upload.wikimedia.org') || game.coverUrl.startsWith('cover://xbox/'))

  const install = (e: React.MouseEvent): void => {
    e.stopPropagation() // Klick auf „Installieren" öffnet NICHT die Detailseite
    if (game.installUrl) window.open(game.installUrl) // steam://install/… bzw. Epic-Protokoll
    else window.api.openPlatformLauncher(game.source) // Launcher ohne Direkt-Link
  }

  return (
    <div className="tile not-installed" title={game.name} onClick={onClick}>
      <div className="cover">
        {game.coverUrl && !failed ? (
          <img
            src={game.coverUrl}
            alt={game.name}
            className={isLogo ? 'logo-cover' : undefined}
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="cover-fallback">{game.name.charAt(0).toUpperCase()}</div>
        )}
        <span className="ni-badge">{platformLabel(game.source)}</span>
        <button className="ni-install" onClick={install}>
          {game.installUrl ? '⬇ Installieren' : '↗ Launcher öffnen'}
        </button>
      </div>
      <div className="tile-info">
        <div className="tile-name">{game.name}</div>
        <div className="tile-meta">
          {game.playtimeSec > 0 ? formatPlaytime(game.playtimeSec) : 'Nie gespielt'}
          {game.lastPlayed ? ` · ${formatLastPlayed(game.lastPlayed)}` : ''}
        </div>
      </div>
    </div>
  )
}

function Cover({ game }: { game: GameCard }): JSX.Element {
  const [failed, setFailed] = useState(false)
  if (game.coverUrl && !failed) {
    // Wikipedia-Logos und quadratische Xbox-Logos -> eingepasst statt beschnitten.
    const isLogo =
      game.coverUrl.includes('upload.wikimedia.org') || game.coverUrl.startsWith('cover://xbox/')
    return (
      <img
        src={game.coverUrl}
        alt={game.name}
        className={isLogo ? 'logo-cover' : undefined}
        onError={() => setFailed(true)}
      />
    )
  }
  return <div className="cover-fallback">{game.name.charAt(0).toUpperCase()}</div>
}

function LauncherChip({
  launcher,
  onLaunch
}: {
  launcher: GameCard
  onLaunch: () => void
}): JSX.Element {
  return (
    <button className="launcher-chip" onClick={onLaunch} title={`${launcher.name} öffnen`}>
      {launcher.coverUrl ? (
        <img className="launcher-icon" src={launcher.coverUrl} alt={launcher.name} />
      ) : (
        <span className="launcher-icon fallback">{launcher.name.charAt(0)}</span>
      )}
      <span className="launcher-name">{launcher.name}</span>
    </button>
  )
}

function GameTile({
  game,
  isRunning,
  liveTotalSec,
  onClick
}: {
  game: GameCard
  isRunning: boolean
  liveTotalSec: number
  onClick: () => void
}): JSX.Element {
  return (
    <div className={`tile ${isRunning ? 'running' : ''}`} title={game.name} onClick={onClick}>
      <div className="cover">
        <Cover game={game} />
        {isRunning && <span className="live-dot">● läuft</span>}
        {!isRunning && game.updatePending && <span className="update-dot">⬆ Update</span>}
        <span className="badge">{formatPlaytime(liveTotalSec)}</span>
      </div>
      <div className="tile-info">
        <div className="tile-name">{game.name}</div>
        <div className="tile-meta">Zuletzt: {formatLastPlayed(game.lastPlayed)}</div>
      </div>
    </div>
  )
}

function GameDetail({
  game,
  isRunning,
  liveTotalSec,
  onBack,
  onGamesUpdated
}: {
  game: GameCard
  isRunning: boolean
  liveTotalSec: number
  onBack: () => void
  onGamesUpdated: (games: GameCard[]) => void
}): JSX.Element {
  const [busy, setBusy] = useState<null | 'launch' | 'close'>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editingHours, setEditingHours] = useState<string | null>(null) // null = nicht im Bearbeiten-Modus
  const [computingSize, setComputingSize] = useState(false)

  const computeSize = async (): Promise<void> => {
    setComputingSize(true)
    try {
      await window.api.computeGameSize(game.id)
      onGamesUpdated(await window.api.listGames()) // frische Liste inkl. Größe
    } finally {
      setComputingSize(false)
    }
  }

  const savePlaytime = async (): Promise<void> => {
    const hours = parseFloat((editingHours ?? '').replace(',', '.'))
    if (!Number.isNaN(hours) && hours >= 0) {
      const fresh = await window.api.setImportedPlaytime(game.id, Math.round(hours * 3600))
      onGamesUpdated(fresh)
    }
    setEditingHours(null)
  }

  const launch = async (): Promise<void> => {
    setBusy('launch')
    setNotice(null)
    await window.api.launchGame(game.id)
    // kurz "Starte…" zeigen; der Wächter erkennt den Prozess dann selbst.
    setTimeout(() => setBusy(null), 4000)
  }

  const close = async (): Promise<void> => {
    setBusy('close')
    setNotice('Schließe das Spiel … (das kann ein paar Sekunden dauern)')
    const ok = await window.api.closeGame(game.id)
    setBusy(null)
    setNotice(
      ok
        ? null
        : 'Kein laufender Spielprozess gefunden. Falls das Spiel noch startet, kurz warten und erneut „Schließen" drücken.'
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="btn" onClick={onBack}>
          ← Zurück
        </button>
        <div className="brand">
          <h1>{game.name}</h1>
          {isRunning && <span className="live-dot big">● läuft</span>}
        </div>
        <span />
      </header>

      <main className="content detail">
        <div className="detail-top">
          <div className="detail-cover">
            <Cover game={game} />
          </div>

          <div className="detail-info">
          <h2>{game.name}</h2>

          <div className="stat-row">
            <div className="stat">
              <span className="stat-label">
                Gesamte Spielzeit
                {game.platform === 'epic' && editingHours === null && (
                  <button
                    className="edit-btn"
                    title="Bisherige Spielzeit eintragen (steht in deiner Epic-Bibliothek)"
                    onClick={() => setEditingHours('')}
                  >
                    ✎
                  </button>
                )}
              </span>
              {editingHours === null ? (
                <span className="stat-value">{formatPlaytime(liveTotalSec)}</span>
              ) : (
                <span className="stat-edit">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Stunden, z. B. 12,5"
                    value={editingHours}
                    onChange={(e) => setEditingHours(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') savePlaytime()
                      if (e.key === 'Escape') setEditingHours(null)
                    }}
                  />
                  <button className="btn small" onClick={savePlaytime}>
                    ✓
                  </button>
                </span>
              )}
            </div>
            <div className="stat">
              <span className="stat-label">Zuletzt gespielt</span>
              <span className="stat-value">{formatLastPlayed(game.lastPlayed)}</span>
            </div>
            {game.platform === 'steam' && (
              <div className="stat">
                <span className="stat-label">Zuletzt aktualisiert</span>
                <span className="stat-value">{formatLastPlayed(game.manifestLastUpdated)}</span>
              </div>
            )}
            {game.installDir && (
              <div className="stat">
                <span className="stat-label">Belegter Speicher</span>
                {game.sizeBytes !== null ? (
                  <span className="stat-value">{formatGameSize(game.sizeBytes)}</span>
                ) : (
                  <button
                    className="btn small"
                    onClick={computeSize}
                    disabled={computingSize}
                    title="Ordnergröße jetzt berechnen"
                  >
                    {computingSize ? 'Berechne …' : 'Berechnen'}
                  </button>
                )}
              </div>
            )}
          </div>

          {game.updatePending && (
            <div className="nvidia-update available" style={{ marginBottom: 22 }}>
              <span>⬆️ Für dieses Spiel steht ein Update aus.</span>
              {(() => {
                const action = updateActionFor(game)
                return action ? (
                  <button className="btn small" onClick={action.run}>
                    {action.label}
                  </button>
                ) : null
              })()}
            </div>
          )}

          <div className="actions">
            {!isRunning ? (
              <button className="btn primary" onClick={launch} disabled={busy === 'launch'}>
                {busy === 'launch' ? 'Starte …' : '▶ Starten'}
              </button>
            ) : (
              <button className="btn danger" onClick={close} disabled={busy === 'close'}>
                {busy === 'close' ? 'Schließe …' : '■ Schließen'}
              </button>
            )}
            {!isRunning &&
              game.installDir &&
              (() => {
                const action = uninstallActionFor(game.platform, game.platformId)
                return action ? (
                  <button
                    className="btn"
                    title={
                      game.platform === 'steam'
                        ? 'Öffnet Steams Bestätigungs-Dialog — nichts wird sofort gelöscht'
                        : 'Öffnet den Launcher — deinstalliert wird dort'
                    }
                    onClick={() => {
                      action.run()
                      setNotice(action.hint)
                    }}
                  >
                    🗑 Deinstallieren
                  </button>
                ) : null
              })()}
          </div>

            {notice && <div className="notice">{notice}</div>}

            {game.installDir && <div className="install-path">{game.installDir}</div>}
          </div>
        </div>

        <GameDetailExtras
          gameRef={{ platform: game.platform, platformId: game.platformId, name: game.name }}
        />
      </main>
    </div>
  )
}

/**
 * Detailansicht für ein besessenes, aber NICHT installiertes Spiel.
 * Wie die normale Detailseite, aber schreibgeschützt: kein Starten/Schließen,
 * kein Speicherplatz — stattdessen ein „Installieren"-Knopf. Store-Infos,
 * Preise, News und (bei Steam) Erfolge kommen über dieselbe GameRef-Logik.
 */
function NotInstalledDetail({
  game,
  onBack
}: {
  game: NotInstalledGame
  onBack: () => void
}): JSX.Element {
  const install = (): void => {
    if (game.installUrl) window.open(game.installUrl)
    else window.api.openPlatformLauncher(game.source)
  }
  const coverCard: GameCard = {
    id: -1,
    kind: 'game',
    platform: game.source,
    platformId: game.platformId,
    name: game.name,
    installDir: null,
    coverUrl: game.coverUrl,
    totalPlaytimeSec: game.playtimeSec,
    lastPlayed: game.lastPlayed,
    updatePending: false,
    manifestLastUpdated: null,
    sizeBytes: null,
    tags: []
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="btn" onClick={onBack}>
          ← Zurück
        </button>
        <div className="brand">
          <h1>{game.name}</h1>
        </div>
        <span />
      </header>

      <main className="content detail">
        <div className="detail-top">
          <div className="detail-cover">
            <Cover game={coverCard} />
          </div>

          <div className="detail-info">
            <h2>{game.name}</h2>

            <div className="stat-row">
              <div className="stat">
                <span className="stat-label">Status</span>
                <span className="stat-value">Nicht installiert</span>
              </div>
              <div className="stat">
                <span className="stat-label">Plattform</span>
                <span className="stat-value">{platformLabel(game.source)}</span>
              </div>
              {game.playtimeSec > 0 && (
                <div className="stat">
                  <span className="stat-label">Bisher gespielt</span>
                  <span className="stat-value">{formatPlaytime(game.playtimeSec)}</span>
                </div>
              )}
              {game.lastPlayed && (
                <div className="stat">
                  <span className="stat-label">Zuletzt gespielt</span>
                  <span className="stat-value">{formatLastPlayed(game.lastPlayed)}</span>
                </div>
              )}
            </div>

            <div className="actions">
              <button className="btn primary" onClick={install}>
                {game.installUrl ? '⬇ Installieren' : '↗ Launcher öffnen'}
              </button>
            </div>
          </div>
        </div>

        <GameDetailExtras
          gameRef={{ platform: game.source, platformId: game.platformId, name: game.name }}
        />
      </main>
    </div>
  )
}

export default App
