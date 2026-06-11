import { useEffect, useMemo, useState } from 'react'
import type { EpicFreeGame, EpicLibraryGame, SteamOffer } from '@shared/types'
import { formatPlaytime } from './format'

// Shops: pro Plattform eine Detailseite mit allem, was sich auslesen lässt
// (Angebote ohne Login; Epic-Bibliothek über das verbundene Konto).
// Erweiterbar wie der Mods-Tab: neuer Eintrag im Registry-Array genügt.

type ShopSection = {
  id: string
  title: string
  icon: string
  description: string
  render: (onBack: () => void) => JSX.Element
}

const SHOP_SECTIONS: ShopSection[] = [
  {
    id: 'epic',
    title: 'Epic Games',
    icon: '🎁',
    description:
      'Gratisspiele der Woche und deine komplette Epic-Bibliothek — auch alles, was nicht installiert ist.',
    render: (onBack) => <EpicShopView onBack={onBack} />
  },
  {
    id: 'steam',
    title: 'Steam',
    icon: '🏷️',
    description: 'Die aktuellen Steam-Angebote mit Rabatt und Preisen auf einen Blick.',
    render: (onBack) => <SteamShopView onBack={onBack} />
  }
]

function ShopsView(): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null)

  const section = SHOP_SECTIONS.find((s) => s.id === selected)
  if (section) return section.render(() => setSelected(null))

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>🛒 Shops</h1>
          <span className="subtitle">Angebote & Plattform-Details</span>
        </div>
      </header>
      <main className="content">
        <div className="mod-section-grid">
          {SHOP_SECTIONS.map((s) => (
            <button key={s.id} className="mod-section-card" onClick={() => setSelected(s.id)}>
              <span className="mod-section-icon">{s.icon}</span>
              <span className="mod-section-title">{s.title}</span>
              <span className="mod-section-desc">{s.description}</span>
              <span className="mod-section-cta">Öffnen →</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}

// --- Hilfen -------------------------------------------------------------------

function formatCents(cents: number | null, currency: string): string {
  if (cents === null) return ''
  const symbol = currency === 'EUR' ? '€' : currency
  return `${(cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} ${symbol}`
}

function formatDay(unix: number | null): string {
  if (!unix) return ''
  return new Date(unix * 1000).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })
}

// --- Epic ----------------------------------------------------------------------

function EpicShopView({ onBack }: { onBack: () => void }): JSX.Element {
  const [freeGames, setFreeGames] = useState<EpicFreeGame[] | null>(null)
  const [library, setLibrary] = useState<EpicLibraryGame[] | null>(null)
  const [libError, setLibError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    window.api.getEpicFreeGames().then(setFreeGames).catch(() => setFreeGames([]))
    window.api
      .getEpicLibrary()
      .then((r) => (r.ok ? setLibrary(r.games) : setLibError(r.error ?? 'Abruf fehlgeschlagen.')))
      .catch((e) => setLibError(String(e)))
  }, [])

  const current = freeGames?.filter((g) => g.status === 'gratis') ?? []
  const upcoming = freeGames?.filter((g) => g.status === 'demnaechst') ?? []

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!library) return []
    return needle ? library.filter((g) => g.title.toLowerCase().includes(needle)) : library
  }, [library, filter])

  return (
    <div className="app">
      <header className="topbar">
        <button className="btn" onClick={onBack}>
          ← Zurück
        </button>
        <div className="brand">
          <h1>🎁 Epic Games</h1>
        </div>
        <span />
      </header>

      <main className="content">
        <h2 className="section-title">Gratis diese Woche</h2>
        {freeGames === null ? (
          <p className="hint">Lade Gratisspiele …</p>
        ) : current.length === 0 && upcoming.length === 0 ? (
          <p className="hint">Aktuell sind keine Gratisspiele gelistet.</p>
        ) : (
          <div className="offer-grid">
            {current.map((g) => (
              <FreeGameCard key={g.title} game={g} />
            ))}
            {upcoming.map((g) => (
              <FreeGameCard key={g.title} game={g} />
            ))}
          </div>
        )}

        <div className="shop-library-head">
          <h2 className="section-title">
            Deine Epic-Bibliothek{library ? ` (${library.length} Spiele)` : ''}
          </h2>
          {library && library.length > 8 && (
            <input
              type="text"
              className="account-code-input shop-filter"
              placeholder="Suchen …"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          )}
        </div>
        {library === null && !libError && (
          <p className="hint">
            Lade Bibliothek … Beim allerersten Mal kann das eine Minute dauern (danach geht es
            schnell, die Daten werden zwischengespeichert).
          </p>
        )}
        {libError && (
          <p className="hint">
            ⚠ {libError} — ist dein Epic-Konto unter „Konten" verbunden?
          </p>
        )}
        {library && (
          <div className="shop-library">
            {filtered.map((g) => (
              <div key={g.appName} className="shop-row">
                {g.coverUrl ? (
                  <img className="shop-row-cover" src={g.coverUrl} alt="" loading="lazy" />
                ) : (
                  <span className="shop-row-cover fallback">{g.title.charAt(0)}</span>
                )}
                <div className="shop-row-main">
                  <div className="shop-row-title">{g.title}</div>
                  <div className="shop-row-meta">
                    {g.playtimeSec > 0 ? `Spielzeit: ${formatPlaytime(g.playtimeSec)}` : 'nie gespielt'}
                  </div>
                </div>
                {g.installed && <span className="shop-installed">✓ installiert</span>}
              </div>
            ))}
            {filtered.length === 0 && <p className="hint">Kein Treffer für „{filter}".</p>}
          </div>
        )}
      </main>
    </div>
  )
}

function FreeGameCard({ game }: { game: EpicFreeGame }): JSX.Element {
  const isNow = game.status === 'gratis'
  return (
    <button
      className="offer-card"
      title={game.storeUrl ? 'Im Epic Store ansehen' : game.title}
      onClick={() => game.storeUrl && window.open(game.storeUrl, '_blank')}
    >
      <div className="offer-cover tall">
        {game.coverUrl ? <img src={game.coverUrl} alt={game.title} loading="lazy" /> : <span />}
        <span className={`offer-badge ${isNow ? 'free' : 'soon'}`}>
          {isNow ? 'GRATIS' : 'demnächst'}
        </span>
      </div>
      <div className="offer-info">
        <div className="offer-name">{game.title}</div>
        <div className="offer-meta">
          {isNow
            ? `bis ${formatDay(game.endDate)}`
            : `ab ${formatDay(game.startDate)}`}
          {game.originalPrice ? ` · statt ${game.originalPrice}` : ''}
        </div>
      </div>
    </button>
  )
}

// --- Steam ----------------------------------------------------------------------

function SteamShopView({ onBack }: { onBack: () => void }): JSX.Element {
  const [offers, setOffers] = useState<SteamOffer[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.getSteamOffers().then(setOffers).catch((e) => setError(String(e)))
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        <button className="btn" onClick={onBack}>
          ← Zurück
        </button>
        <div className="brand">
          <h1>🏷️ Steam-Angebote</h1>
          {offers && <span className="subtitle">{offers.length} Angebote</span>}
        </div>
        <span />
      </header>

      <main className="content">
        {offers === null && !error && <p className="hint">Lade Angebote …</p>}
        {error && <p className="hint">⚠ {error}</p>}
        {offers && (
          <div className="offer-grid wide">
            {offers.map((o) => (
              <button
                key={o.appId}
                className="offer-card"
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
                    <s>{formatCents(o.originalPriceCents, o.currency)}</s>{' '}
                    <b>{formatCents(o.finalPriceCents, o.currency)}</b>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        <p className="hint">
          Die Liste entspricht den „Top-Angeboten" der Steam-Startseite. Ein Klick öffnet die
          Store-Seite im Browser — gekauft wird wie immer bei Steam selbst.
        </p>
      </main>
    </div>
  )
}

export default ShopsView
