import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GameCard, RunningGame } from '@shared/types'
import { formatLastPlayed, formatPlaytime } from './format'
import HomeView from './HomeView'
import ModsView from './ModsView'
import SystemView from './SystemView'
import UpdatesView from './UpdatesView'

export type View = 'home' | 'games' | 'updates' | 'mods' | 'system'

// Die App-Hülle: feste Seitenleiste links, daneben die aktive Ansicht.
function App(): JSX.Element {
  const [view, setView] = useState<View>('home') // Startseite ist die erste Ansicht
  const [appVersion, setAppVersion] = useState('')
  const [updateVersion, setUpdateVersion] = useState<string | null>(null) // fertig geladenes App-Update

  useEffect(() => {
    window.api.getAppVersion().then(setAppVersion).catch(() => {})
    return window.api.onAppUpdateReady(setUpdateVersion)
  }, [])

  return (
    <div className="shell">
      <nav className="sidebar">
        <button
          className={`sidebar-brand ${view === 'home' ? 'active' : ''}`}
          onClick={() => setView('home')}
          title="Zur Startseite"
        >
          🎮 Hub
        </button>
        <button
          className={`nav-item ${view === 'games' ? 'active' : ''}`}
          onClick={() => setView('games')}
        >
          <span className="nav-icon">🎮</span> Spiele
        </button>
        <button
          className={`nav-item ${view === 'updates' ? 'active' : ''}`}
          onClick={() => setView('updates')}
        >
          <span className="nav-icon">⬆</span> Updates
        </button>
        <button
          className={`nav-item ${view === 'mods' ? 'active' : ''}`}
          onClick={() => setView('mods')}
        >
          <span className="nav-icon">🧩</span> Mods
        </button>
        <button
          className={`nav-item ${view === 'system' ? 'active' : ''}`}
          onClick={() => setView('system')}
        >
          <span className="nav-icon">🖥️</span> System / Treiber
        </button>
        <div className="sidebar-footer">
          {updateVersion ? (
            <button
              className="update-ready-btn"
              title="Das Update ist schon heruntergeladen — die App startet kurz neu."
              onClick={() => window.api.installAppUpdate()}
            >
              ⬆ Update {updateVersion} bereit — neu starten
            </button>
          ) : (
            appVersion && <span className="app-version">Version {appVersion}</span>
          )}
        </div>
      </nav>
      <div className="shell-content">
        {view === 'home' && <HomeView onNavigate={setView} />}
        {view === 'games' && <GamesView />}
        {view === 'updates' && <UpdatesView />}
        {view === 'mods' && <ModsView />}
        {view === 'system' && <SystemView />}
      </div>
    </div>
  )
}

function GamesView(): JSX.Element {
  const [games, setGames] = useState<GameCard[]>([])
  const [running, setRunning] = useState<Map<number, number>>(new Map()) // gameId -> startedAt
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  const reloadGames = useCallback(async () => {
    try {
      setGames(await window.api.listGames())
    } catch {
      /* ignorieren */
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
    }
  }, [])

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

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>🎮 Spiele Hub</h1>
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

        {playable.length > 0 && <h2 className="section-title">Spiele</h2>}
        <div className="grid">
          {playable.map((game) => (
            <GameTile
              key={game.id}
              game={game}
              isRunning={running.has(game.id)}
              liveTotalSec={liveTotal(game)}
              onClick={() => setSelectedId(game.id)}
            />
          ))}
        </div>
      </main>
    </div>
  )
}

function Cover({ game }: { game: GameCard }): JSX.Element {
  const [failed, setFailed] = useState(false)
  if (game.coverUrl && !failed) {
    return <img src={game.coverUrl} alt={game.name} onError={() => setFailed(true)} />
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
          </div>

          {game.updatePending && (
            <div className="nvidia-update available" style={{ marginBottom: 22 }}>
              <span>⬆ Für dieses Spiel steht ein Steam-Update aus.</span>
              <button
                className="btn small"
                onClick={() => window.open(`steam://nav/games/details/${game.platformId}`, '_blank')}
              >
                In Steam aktualisieren ↗
              </button>
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
          </div>

          {notice && <div className="notice">{notice}</div>}

          {game.installDir && <div className="install-path">{game.installDir}</div>}
        </div>
      </main>
    </div>
  )
}

export default App
