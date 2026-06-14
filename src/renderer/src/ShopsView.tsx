import { useEffect, useMemo, useState } from 'react'
import type {
  EpicFreeGame,
  EpicLibraryGame,
  EpicSearchResult,
  SteamOffer,
  SteamSearchResult,
  WishlistItem
} from '@shared/types'
import { formatEuro, formatPlaytime } from './format'

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
    description:
      'Die aktuellen Steam-Angebote mit Rabatt und Preisen — per ☆ wandern Spiele direkt auf die Wunschliste.',
    render: (onBack) => <SteamShopView onBack={onBack} />
  }
]

function ShopsView(): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null)
  // Highlights aus allen Shops für die Übersicht.
  const [freeGames, setFreeGames] = useState<EpicFreeGame[]>([])
  const [offers, setOffers] = useState<SteamOffer[]>([])

  useEffect(() => {
    window.api
      .getEpicFreeGames()
      .then((g) => setFreeGames(g.filter((f) => f.status === 'gratis')))
      .catch(() => {})
    window.api
      .getSteamOffers()
      .then((o) => setOffers(o.slice(0, 12)))
      .catch(() => {})
  }, [])

  if (selected === 'wishlist') return <WishlistView onBack={() => setSelected(null)} />
  const section = SHOP_SECTIONS.find((s) => s.id === selected)
  if (section) return section.render(() => setSelected(null))

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>🛒 Shops</h1>
          <span className="subtitle">Angebote & Plattform-Details</span>
        </div>
        <button className="btn" onClick={() => setSelected('wishlist')}>
          <span className="wl-star">★</span> Wunschliste
        </button>
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

        {/* Highlights aus allen Shops */}
        {freeGames.length > 0 && (
          <>
            <h2 className="section-title" style={{ marginTop: 30 }}>
              🎁 Gratis bei Epic
            </h2>
            <div className="offer-row">
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
            </div>
          </>
        )}

        {offers.length > 0 && (
          <>
            <h2 className="section-title" style={{ marginTop: 18 }}>
              🏷️ Steam-Angebote
            </h2>
            <div className="offer-row">
              {offers.map((o) => (
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
                      <s>{formatCents(o.originalPriceCents, o.currency)}</s>{' '}
                      <b>{formatCents(o.finalPriceCents, o.currency)}</b>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
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

/** Kleines Zeilen-Cover mit Buchstaben-Rückfall, falls das Bild nicht lädt. */
function RowCover({ url, name }: { url: string | null; name: string }): JSX.Element {
  const [failed, setFailed] = useState(false)
  if (!url || failed) {
    return <span className="shop-row-cover fallback">{name.charAt(0)}</span>
  }
  return (
    <img
      className="shop-row-cover"
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
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

        <StoreSearch
          title="Epic-Store durchsuchen"
          placeholder="🔍 Spiel im Epic Store suchen …"
          run={runEpicSearch}
        />

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

// --- Store-Suche (gemeinsam für Steam & Epic) -------------------------------------

/** Einheitliche Treffer-Zeile, egal aus welchem Shop. */
interface StoreSearchRow {
  key: string // == WishlistItem.appId
  shop: 'steam' | 'epic'
  name: string
  coverUrl: string | null
  priceCents: number | null
  originalCents: number | null
  discountPct: number
  storeUrl: string | null
}

function epicToRow(r: EpicSearchResult): StoreSearchRow {
  return { key: r.id, shop: 'epic', ...r, coverUrl: r.coverUrl }
}

function steamToRow(r: SteamSearchResult): StoreSearchRow {
  return { key: r.appId, shop: 'steam', ...r }
}

// Store-Suche: Ergebnisse mit Preis, Klick öffnet die Store-Seite,
// ☆ legt das Spiel auf die (shop-übergreifende) Wunschliste.
function StoreSearch({
  title,
  placeholder,
  run,
  onWishlistChanged
}: {
  title: string
  placeholder: string
  run: (term: string) => Promise<{ ok: boolean; rows: StoreSearchRow[]; error?: string }>
  onWishlistChanged?: (items: WishlistItem[]) => void
}): JSX.Element {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<StoreSearchRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [wishedIds, setWishedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    window.api
      .getWishlist()
      .then((items) => setWishedIds(new Set(items.map((w) => w.appId))))
      .catch(() => {})
  }, [])

  const runSearch = async (): Promise<void> => {
    if (search.trim().length < 2) return
    setSearching(true)
    setError(null)
    try {
      const r = await run(search)
      setResults(r.rows)
      if (!r.ok) setError(r.error ?? 'Suche fehlgeschlagen.')
    } finally {
      setSearching(false)
    }
  }

  const add = async (r: StoreSearchRow): Promise<void> => {
    const items = await window.api.addToWishlist({
      appId: r.key,
      name: r.name,
      coverUrl: r.coverUrl,
      shop: r.shop,
      storeUrl: r.storeUrl
    })
    setWishedIds(new Set(items.map((w) => w.appId)))
    onWishlistChanged?.(items)
  }

  return (
    <section style={{ marginBottom: 30 }}>
      <h2 className="section-title">{title}</h2>
      <div className="account-actions" style={{ maxWidth: 560 }}>
        <input
          type="text"
          className="account-code-input"
          placeholder={placeholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') runSearch()
          }}
        />
        <button className="btn" onClick={runSearch} disabled={searching || search.trim().length < 2}>
          {searching ? 'Suche …' : 'Suchen'}
        </button>
      </div>

      {error && <p className="hint">⚠ {error}</p>}
      {results && (
        <div className="shop-library" style={{ marginTop: 12 }}>
          {results.length === 0 && !error && <p className="hint">Nichts gefunden.</p>}
          {results.map((r) => (
            <div
              key={r.key}
              className="shop-row clickable"
              title={r.storeUrl ? 'Im Store ansehen' : r.name}
              onClick={() => r.storeUrl && window.open(r.storeUrl, '_blank')}
            >
              <RowCover url={r.coverUrl} name={r.name} />
              <div className="shop-row-main">
                <div className="shop-row-title">{r.name}</div>
                <div className="shop-row-meta">
                  {r.priceCents === null
                    ? ''
                    : r.priceCents === 0
                      ? 'Gratis'
                      : r.discountPct > 0
                        ? `${formatEuro(r.priceCents)} statt ${r.originalCents !== null ? formatEuro(r.originalCents) : '—'}`
                        : formatEuro(r.priceCents)}
                </div>
              </div>
              {r.discountPct > 0 && <span className="offer-badge discount">-{r.discountPct}%</span>}
              {wishedIds.has(r.key) ? (
                <span className="shop-installed">✓ Wunschliste</span>
              ) : (
                <button
                  className="btn small"
                  title="Auf die Wunschliste (mit Preisalarm)"
                  onClick={(e) => {
                    e.stopPropagation() // nicht zusätzlich die Store-Seite öffnen
                    add(r)
                  }}
                >
                  ☆
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

async function runEpicSearch(
  term: string
): Promise<{ ok: boolean; rows: StoreSearchRow[]; error?: string }> {
  const r = await window.api.searchEpicStore(term)
  return r.ok
    ? { ok: true, rows: r.results.map(epicToRow) }
    : { ok: false, rows: [], error: r.error }
}

async function runSteamSearch(
  term: string
): Promise<{ ok: boolean; rows: StoreSearchRow[]; error?: string }> {
  try {
    return { ok: true, rows: (await window.api.searchSteamStore(term)).map(steamToRow) }
  } catch {
    return { ok: false, rows: [], error: 'Steam-Suche fehlgeschlagen.' }
  }
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
  const [wishlist, setWishlist] = useState<WishlistItem[]>([])

  useEffect(() => {
    window.api.getSteamOffers().then(setOffers).catch((e) => setError(String(e)))
    window.api.getWishlist().then(setWishlist).catch(() => {})
  }, [])

  const wishedIds = useMemo(() => new Set(wishlist.map((w) => w.appId)), [wishlist])

  const toggleWish = async (o: SteamOffer): Promise<void> => {
    const appId = String(o.appId)
    setWishlist(
      wishedIds.has(appId)
        ? await window.api.removeFromWishlist(appId)
        : await window.api.addToWishlist({
            appId,
            name: o.name,
            coverUrl: o.coverUrl,
            shop: 'steam',
            storeUrl: o.storeUrl
          })
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="btn" onClick={onBack}>
          ← Zurück
        </button>
        <div className="brand">
          <h1>🏷️ Steam</h1>
          {offers && <span className="subtitle">{offers.length} Angebote</span>}
        </div>
        <span />
      </header>

      <main className="content">
        <StoreSearch
          title="Steam-Store durchsuchen"
          placeholder="🔍 Spiel im Steam Store suchen …"
          run={runSteamSearch}
          onWishlistChanged={setWishlist}
        />

        <h2 className="section-title">Aktuelle Angebote</h2>
        {offers === null && !error && <p className="hint">Lade Angebote …</p>}
        {error && <p className="hint">⚠ {error}</p>}
        {offers && (
          <div className="offer-grid wide">
            {offers.map((o) => (
              <div
                key={o.appId}
                className="offer-card"
                title="Im Steam Store ansehen"
                onClick={() => window.open(o.storeUrl, '_blank')}
              >
                <div className="offer-cover">
                  {o.coverUrl ? <img src={o.coverUrl} alt={o.name} loading="lazy" /> : <span />}
                  <span className="offer-badge discount">-{o.discountPercent}%</span>
                  <button
                    className={`wish-btn ${wishedIds.has(String(o.appId)) ? 'active' : ''}`}
                    title={
                      wishedIds.has(String(o.appId))
                        ? 'Von der Wunschliste entfernen'
                        : 'Auf die Wunschliste (mit Preisalarm)'
                    }
                    onClick={(e) => {
                      e.stopPropagation() // nicht zusätzlich den Store öffnen
                      toggleWish(o)
                    }}
                  >
                    {wishedIds.has(String(o.appId)) ? '★' : '☆'}
                  </button>
                </div>
                <div className="offer-info">
                  <div className="offer-name">{o.name}</div>
                  <div className="offer-meta">
                    <s>{formatCents(o.originalPriceCents, o.currency)}</s>{' '}
                    <b>{formatCents(o.finalPriceCents, o.currency)}</b>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="hint">
          Die Liste entspricht den „Top-Angeboten" der Steam-Startseite. Ein Klick öffnet die
          Store-Seite im Browser — gekauft wird wie immer bei Steam selbst. Mit ☆ legst du ein
          Spiel auf die Wunschliste: Sobald es im Angebot ist, meldet sich die 🔔-Glocke.
        </p>
      </main>
    </div>
  )
}

// --- Wunschliste (eigene, shop-übergreifende Seite) -------------------------------

function WishlistView({ onBack }: { onBack: () => void }): JSX.Element {
  const [wishlist, setWishlist] = useState<WishlistItem[]>([])
  const onChanged = setWishlist

  useEffect(() => {
    window.api.getWishlist().then(setWishlist).catch(() => {})
  }, [])

  const [search, setSearch] = useState('')
  const [steamResults, setSteamResults] = useState<SteamSearchResult[] | null>(null)
  const [epicResults, setEpicResults] = useState<EpicSearchResult[] | null>(null)
  const [epicError, setEpicError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const importFromSteam = async (): Promise<void> => {
    setImporting(true)
    setImportMsg(null)
    try {
      const result = await window.api.importSteamWishlist()
      if (result.ok) {
        onChanged(await window.api.getWishlist())
        setImportMsg({
          kind: 'ok',
          text:
            result.imported > 0
              ? `${result.imported} von ${result.total} Einträgen aus deiner Steam-Wunschliste übernommen.`
              : `Alle ${result.total} Einträge deiner Steam-Wunschliste waren schon da.`
        })
      } else {
        setImportMsg({ kind: 'error', text: result.error ?? 'Import fehlgeschlagen.' })
      }
    } finally {
      setImporting(false)
    }
  }

  // Beide Stores gleichzeitig durchsuchen.
  const runSearch = async (): Promise<void> => {
    if (search.trim().length < 2) return
    setSearching(true)
    setEpicError(null)
    try {
      const [steam, epic] = await Promise.all([
        window.api.searchSteamStore(search).catch(() => [] as SteamSearchResult[]),
        window.api.searchEpicStore(search)
      ])
      setSteamResults(steam)
      if (epic.ok) {
        setEpicResults(epic.results)
      } else {
        setEpicResults([])
        setEpicError(epic.error)
      }
    } finally {
      setSearching(false)
    }
  }

  const addSteam = async (r: SteamSearchResult): Promise<void> => {
    onChanged(
      await window.api.addToWishlist({
        appId: r.appId,
        name: r.name,
        coverUrl: r.coverUrl,
        shop: 'steam',
        storeUrl: r.storeUrl
      })
    )
  }

  const addEpic = async (r: EpicSearchResult): Promise<void> => {
    onChanged(
      await window.api.addToWishlist({
        appId: r.id,
        name: r.name,
        coverUrl: r.coverUrl,
        shop: 'epic',
        storeUrl: r.storeUrl
      })
    )
  }

  const remove = async (appId: string): Promise<void> => {
    onChanged(await window.api.removeFromWishlist(appId))
  }

  const wishedIds = new Set(wishlist.map((w) => w.appId))

  return (
    <div className="app">
      <header className="topbar">
        <button className="btn" onClick={onBack}>
          ← Zurück
        </button>
        <div className="brand">
          <h1><span className="wl-star">★</span> Wunschliste</h1>
          {wishlist.length > 0 && <span className="subtitle">{wishlist.length} Spiele</span>}
        </div>
        <button
          className="btn"
          onClick={importFromSteam}
          disabled={importing}
          title="Übernimmt die Wunschliste deines Steam-Kontos (muss öffentlich sein)"
        >
          {importing ? 'Importiere …' : '⬇ Steam-Wunschliste übernehmen'}
        </button>
      </header>

      <main className="content">
      {importMsg && <div className={`account-message ${importMsg.kind}`}>{importMsg.text}</div>}

      {wishlist.length === 0 && (
        <p className="hint">
          Noch leer. Übernimm oben deine Steam-Wunschliste, suche unten ein Spiel oder klicke bei
          den Steam-Angeboten auf ☆ — die App prüft dann alle 6 Stunden den Preis und meldet
          Rabatte über die 🔔-Glocke.
        </p>
      )}

      {wishlist.length > 0 && (
        <div className="shop-library" style={{ marginBottom: 16 }}>
          {wishlist.map((w) => (
            <div key={w.appId} className="shop-row">
              <RowCover url={w.coverUrl} name={w.name} />
              <div className="shop-row-main">
                <div className="shop-row-title">
                  {w.name} <span className="shop-tag">{w.shop === 'epic' ? 'Epic' : 'Steam'}</span>
                </div>
                <div className="shop-row-meta">
                  {w.priceCents === null
                    ? 'Noch kein Preis — vermutlich nicht erschienen (oder gratis)'
                    : w.discountPct > 0
                      ? `Im Angebot: ${formatEuro(w.priceCents)} statt ${w.originalCents !== null ? formatEuro(w.originalCents) : '—'}`
                      : `Aktuell ${formatEuro(w.priceCents)} — kein Rabatt`}
                </div>
              </div>
              {w.discountPct > 0 && <span className="offer-badge discount">-{w.discountPct}%</span>}
              <button
                className="btn small"
                title="Im Store ansehen"
                onClick={() =>
                  window.open(
                    w.storeUrl ?? `https://store.steampowered.com/app/${w.appId}/`,
                    '_blank'
                  )
                }
              >
                ↗
              </button>
              <button
                className="btn small"
                title="Von der Wunschliste entfernen"
                onClick={() => remove(w.appId)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="account-actions" style={{ maxWidth: 560 }}>
        <input
          type="text"
          className="account-code-input"
          placeholder="🔍 In Steam UND Epic suchen …"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') runSearch()
          }}
        />
        <button className="btn" onClick={runSearch} disabled={searching || search.trim().length < 2}>
          {searching ? 'Suche …' : 'Suchen'}
        </button>
      </div>

      {steamResults && (
        <>
          <h3 className="section-title" style={{ marginTop: 16 }}>
            🏷️ Steam
          </h3>
          <div className="shop-library">
            {steamResults.length === 0 && <p className="hint">Nichts gefunden.</p>}
            {steamResults.map((r) => (
              <div key={r.appId} className="shop-row">
                <RowCover url={r.coverUrl} name={r.name} />
                <div className="shop-row-main">
                  <div className="shop-row-title">{r.name}</div>
                  <div className="shop-row-meta">
                    {r.priceCents === null
                      ? ''
                      : r.discountPct > 0
                        ? `${formatEuro(r.priceCents)} statt ${r.originalCents !== null ? formatEuro(r.originalCents) : '—'}`
                        : formatEuro(r.priceCents)}
                  </div>
                </div>
                {r.discountPct > 0 && (
                  <span className="offer-badge discount">-{r.discountPct}%</span>
                )}
                {wishedIds.has(r.appId) ? (
                  <span className="shop-installed">✓ auf der Liste</span>
                ) : (
                  <button className="btn primary small" onClick={() => addSteam(r)}>
                    + Wunschliste
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {(epicResults || epicError) && (
        <>
          <h3 className="section-title" style={{ marginTop: 16 }}>
            🎁 Epic Games
          </h3>
          {epicError && <p className="hint">⚠ {epicError}</p>}
          <div className="shop-library">
            {epicResults && epicResults.length === 0 && !epicError && (
              <p className="hint">Nichts gefunden.</p>
            )}
            {(epicResults ?? []).map((r) => (
              <div key={r.id} className="shop-row">
                <RowCover url={r.coverUrl} name={r.name} />
                <div className="shop-row-main">
                  <div className="shop-row-title">{r.name}</div>
                  <div className="shop-row-meta">
                    {r.priceCents === null
                      ? ''
                      : r.priceCents === 0
                        ? 'Gratis'
                        : r.discountPct > 0
                          ? `${formatEuro(r.priceCents)} statt ${r.originalCents !== null ? formatEuro(r.originalCents) : '—'}`
                          : formatEuro(r.priceCents)}
                  </div>
                </div>
                {r.discountPct > 0 && (
                  <span className="offer-badge discount">-{r.discountPct}%</span>
                )}
                {wishedIds.has(r.id) ? (
                  <span className="shop-installed">✓ auf der Liste</span>
                ) : (
                  <button className="btn primary small" onClick={() => addEpic(r)}>
                    + Wunschliste
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <p className="hint" style={{ marginTop: 18 }}>
        Die Wunschliste gilt shop-übergreifend: Die Suche findet Spiele in Steam und Epic, Preise
        werden direkt beim jeweiligen Shop geprüft, und Rabatte landen in der 🔔-Glocke.
      </p>
      </main>
    </div>
  )
}

export default ShopsView
