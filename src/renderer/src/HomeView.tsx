import { useEffect, useState } from 'react'
import type { GameCard, NvidiaUpdate, WotStatus } from '@shared/types'
import type { View } from './App'
import { formatLastPlayed, formatPlaytime } from './format'

function HomeView({ onNavigate }: { onNavigate: (v: View) => void }): JSX.Element {
  const [games, setGames] = useState<GameCard[]>([])
  const [wot, setWot] = useState<WotStatus | null>(null)
  const [mcCount, setMcCount] = useState<number | null>(null)
  const [nvidia, setNvidia] = useState<NvidiaUpdate | 'loading' | null>('loading')

  useEffect(() => {
    // Sofort den letzten Stand zeigen, parallel im Hintergrund frisch scannen.
    window.api.listGames().then(setGames).catch(() => {})
    window.api
      .scanLibrary()
      .then((r) => {
        if (r.ok) setGames(r.games)
      })
      .catch(() => {})
    window.api.getWotStatus().then(setWot).catch(() => {})
    window.api
      .getMcProfiles()
      .then((p) => setMcCount(p.length))
      .catch(() => {})
    // Nvidia-Treiber-Status für die Treiber-Karte.
    ;(async () => {
      try {
        const devices = await window.api.getDevices()
        const gpu = devices.find((d) => d.isNvidiaGpu)
        setNvidia(gpu ? await window.api.checkNvidiaUpdate(gpu.name, gpu.driverVersion) : null)
      } catch {
        setNvidia(null)
      }
    })()
  }, [])

  const playable = games.filter((g) => g.kind === 'game')
  const launchers = games.filter((g) => g.kind === 'launcher')
  const pendingUpdates = playable.filter((g) => g.updatePending).length
  const totalSec = playable.reduce((s, g) => s + g.totalPlaytimeSec, 0)
  const recent = playable
    .filter((g) => g.lastPlayed)
    .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
    .slice(0, 6)

  const wotRestore = wot?.ok ? wot.needsRestore : 0
  const wotActive = wot?.ok ? wot.mods.filter((m) => m.enabled && m.installed).length : null

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>🏠 Startseite</h1>
          <span className="subtitle">Willkommen zurück!</span>
        </div>
      </header>

      <main className="content">
        {/* Highlights als klickbare Status-Karten */}
        <div className="stat-cards">
          <button className="stat-card" onClick={() => onNavigate('games')}>
            <span className="stat-card-icon">🎮</span>
            <span className="stat-card-title">Spiele</span>
            <span className="stat-card-info">
              {playable.length} installiert · {formatPlaytime(totalSec)} gesamt
            </span>
          </button>

          <button
            className={`stat-card ${pendingUpdates > 0 ? 'attention' : ''}`}
            onClick={() => onNavigate('updates')}
          >
            <span className="stat-card-icon">⬆</span>
            <span className="stat-card-title">Updates</span>
            <span className="stat-card-info">
              {pendingUpdates > 0 ? `${pendingUpdates} ausstehend` : 'alles aktuell ✓'}
            </span>
          </button>

          <button
            className={`stat-card ${wotRestore > 0 ? 'attention' : ''}`}
            onClick={() => onNavigate('mods')}
          >
            <span className="stat-card-icon">🧩</span>
            <span className="stat-card-title">Mods</span>
            <span className="stat-card-info">
              {wotRestore > 0
                ? `${wotRestore} WoT-Mods wiederherstellen!`
                : [
                    wotActive !== null ? `WoT: ${wotActive} aktiv` : null,
                    mcCount !== null ? `Minecraft: ${mcCount} Profile` : null
                  ]
                    .filter(Boolean)
                    .join(' · ') || '–'}
            </span>
          </button>

          <button
            className={`stat-card ${nvidia !== 'loading' && nvidia?.updateAvailable ? 'attention' : ''}`}
            onClick={() => onNavigate('system')}
          >
            <span className="stat-card-icon">🖥️</span>
            <span className="stat-card-title">System / Treiber</span>
            <span className="stat-card-info">
              {nvidia === 'loading'
                ? 'prüfe Nvidia-Treiber …'
                : nvidia?.updateAvailable
                  ? `Treiber-Update ${nvidia.latestVersion} verfügbar`
                  : nvidia?.ok
                    ? 'Nvidia-Treiber aktuell ✓'
                    : 'Geräte & Treiber ansehen'}
            </span>
          </button>
        </div>

        {/* Schnellauswahl: zuletzt gespielt, Klick = direkt starten */}
        {recent.length > 0 && (
          <>
            <h2 className="section-title">Weiter spielen</h2>
            <div className="grid home-grid">
              {recent.map((g) => (
                <HomeTile key={g.id} game={g} />
              ))}
            </div>
          </>
        )}

        {/* Launcher-Schnellstart */}
        {launchers.length > 0 && (
          <>
            <h2 className="section-title" style={{ marginTop: 26 }}>
              Launcher
            </h2>
            <div className="launcher-bar">
              {launchers.map((l) => (
                <button
                  key={l.id}
                  className="launcher-chip"
                  onClick={() => window.api.launchGame(l.id)}
                  title={`${l.name} öffnen`}
                >
                  {l.coverUrl ? (
                    <img className="launcher-icon" src={l.coverUrl} alt="" />
                  ) : (
                    <span className="launcher-icon fallback">{l.name.charAt(0)}</span>
                  )}
                  <span className="launcher-name">{l.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function HomeTile({ game }: { game: GameCard }): JSX.Element {
  const [imgFailed, setImgFailed] = useState(false)
  return (
    <div className="tile" title={`${game.name} starten`} onClick={() => window.api.launchGame(game.id)}>
      <div className="cover">
        {game.coverUrl && !imgFailed ? (
          <img src={game.coverUrl} alt={game.name} onError={() => setImgFailed(true)} />
        ) : (
          <div className="cover-fallback">{game.name.charAt(0).toUpperCase()}</div>
        )}
        <span className="play-overlay">▶</span>
        <span className="badge">{formatPlaytime(game.totalPlaytimeSec)}</span>
      </div>
      <div className="tile-info">
        <div className="tile-name">{game.name}</div>
        <div className="tile-meta">Zuletzt: {formatLastPlayed(game.lastPlayed)}</div>
      </div>
    </div>
  )
}

export default HomeView
