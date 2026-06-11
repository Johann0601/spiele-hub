import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { EpicFreeGame, GameCard, NvidiaUpdate, SteamOffer, WotStatus } from '@shared/types'
import type { View } from './App'
import { formatLastPlayed, formatPlaytime } from './format'

function HomeView({
  onNavigate,
  onOpenGame
}: {
  onNavigate: (v: View) => void
  onOpenGame: (gameId: number) => void
}): JSX.Element {
  const [games, setGames] = useState<GameCard[]>([])
  const [wot, setWot] = useState<WotStatus | null>(null)
  const [mcCount, setMcCount] = useState<number | null>(null)
  const [nvidia, setNvidia] = useState<NvidiaUpdate | 'loading' | null>('loading')
  const [freeGames, setFreeGames] = useState<EpicFreeGame[]>([])
  const [steamOffers, setSteamOffers] = useState<SteamOffer[]>([])

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
    // Beste Angebote für die Startseite (beides öffentliche Endpunkte).
    window.api
      .getEpicFreeGames()
      .then((g) => setFreeGames(g.filter((f) => f.status === 'gratis')))
      .catch(() => {})
    window.api
      .getSteamOffers()
      .then((o) => setSteamOffers(o.slice(0, 12)))
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
    .slice(0, 10)

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
            <span className="stat-card-icon">⬆️</span>
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
            onClick={() => onNavigate('settings-system')}
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
            <OfferRow>
              {recent.map((g) => (
                <HomeTile key={g.id} game={g} onOpen={() => onOpenGame(g.id)} />
              ))}
            </OfferRow>
          </>
        )}

        {/* Gratis bei Epic — eigene Reihe, hochkant, seitlich scrollbar */}
        {freeGames.length > 0 && (
          <>
            <div className="home-offers-head">
              <h2 className="section-title" style={{ marginTop: 26 }}>
                Gratis bei Epic
              </h2>
              <button className="btn small" onClick={() => onNavigate('shops')}>
                Alle ansehen →
              </button>
            </div>
            <OfferRow>
              {freeGames.map((g) => (
                <button
                  key={g.title}
                  className="offer-card epic-card"
                  title="Im Epic Store ansehen"
                  onClick={() => g.storeUrl && window.open(g.storeUrl, '_blank')}
                >
                  <div className="offer-cover tall">
                    {g.coverUrl ? <img src={g.coverUrl} alt={g.title} loading="lazy" /> : <span />}
                    <span className="offer-badge free">GRATIS</span>
                  </div>
                  <div className="offer-info">
                    <div className="offer-name">{g.title}</div>
                    <div className="offer-meta">
                      {g.originalPrice ? `statt ${g.originalPrice}` : 'kostenlos'}
                    </div>
                  </div>
                </button>
              ))}
            </OfferRow>
          </>
        )}

        {/* Steam-Angebote — eigene Reihe, Querformat, seitlich scrollbar */}
        {steamOffers.length > 0 && (
          <>
            <div className="home-offers-head">
              <h2 className="section-title" style={{ marginTop: 26 }}>
                Steam-Angebote
              </h2>
              <button className="btn small" onClick={() => onNavigate('shops')}>
                Alle ansehen →
              </button>
            </div>
            <OfferRow>
              {steamOffers.map((o) => (
                <button
                  key={o.appId}
                  className="offer-card steam-card"
                  title="Im Steam Store ansehen"
                  onClick={() => window.open(o.storeUrl, '_blank')}
                >
                  <div className="offer-cover">
                    {o.coverUrl ? <img src={o.coverUrl} alt={o.name} loading="lazy" /> : <span />}
                    <span className="offer-badge discount">-{o.discountPercent}%</span>
                  </div>
                  <div className="offer-info">
                    <div className="offer-name">{o.name}</div>
                    <div className="offer-meta">
                      <s>
                        {o.originalPriceCents !== null
                          ? `${(o.originalPriceCents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`
                          : ''}
                      </s>{' '}
                      <b>
                        {o.finalPriceCents !== null
                          ? `${(o.finalPriceCents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`
                          : ''}
                      </b>
                    </div>
                  </div>
                </button>
              ))}
            </OfferRow>
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

/** Seitlich scrollbare Reihe: Das Mausrad scrollt NUR die Reihe (horizontal),
 *  die Seite selbst bleibt stehen. Dafür muss der Wheel-Listener von Hand mit
 *  passive:false registriert werden — nur so darf er preventDefault aufrufen. */
function OfferRow({ children }: { children: ReactNode }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (e.deltaY !== 0 && el.scrollWidth > el.clientWidth) {
        e.preventDefault() // Seite nicht vertikal scrollen
        el.scrollLeft += e.deltaY
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div className="offer-row" ref={ref}>
      {children}
    </div>
  )
}

// Kachel der Schnellauswahl: Klick aufs Bild = Detailansicht öffnen,
// nur der quadratische ▶-Knopf in der Mitte startet das Spiel direkt.
function HomeTile({ game, onOpen }: { game: GameCard; onOpen: () => void }): JSX.Element {
  const [imgFailed, setImgFailed] = useState(false)
  return (
    <div className="tile home-tile" title={game.name} onClick={onOpen}>
      <div className="cover">
        {game.coverUrl && !imgFailed ? (
          <img src={game.coverUrl} alt={game.name} onError={() => setImgFailed(true)} />
        ) : (
          <div className="cover-fallback">{game.name.charAt(0).toUpperCase()}</div>
        )}
        <button
          className="play-btn"
          title={`${game.name} starten`}
          onClick={(e) => {
            e.stopPropagation() // nicht zusätzlich die Detailansicht öffnen
            window.api.launchGame(game.id)
          }}
        >
          ▶
        </button>
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
