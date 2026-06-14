import { useEffect, useState } from 'react'
import type {
  AchievementsResult,
  GameDetails,
  GameNewsItem,
  GamePriceInfo,
  GameRef
} from '@shared/types'
import { formatEuro } from './format'

// Zusatz-Bereiche der Spiel-Detailseite: Store-Infos (Beschreibung, Genres,
// Screenshots), Steam-Erfolge und News/Patchnotes. Alles wird erst geladen,
// wenn die Detailseite geöffnet ist — und stört nicht, wenn nichts da ist.

function formatNewsDate(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

function GameDetailExtras({ gameRef }: { gameRef: GameRef }): JSX.Element | null {
  const [details, setDetails] = useState<GameDetails | null>(null)
  const [news, setNews] = useState<GameNewsItem[] | null>(null)
  const [achievements, setAchievements] = useState<AchievementsResult | null>(null)
  const [prices, setPrices] = useState<GamePriceInfo | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null) // Screenshot in groß

  useEffect(() => {
    // Bei Spielwechsel alles zurücksetzen und neu laden.
    setDetails(null)
    setNews(null)
    setAchievements(null)
    setPrices(null)
    setLightbox(null)
    let cancelled = false
    window.api.getGameDetails(gameRef).then((d) => !cancelled && setDetails(d)).catch(() => {})
    window.api.getGameNews(gameRef).then((n) => !cancelled && setNews(n)).catch(() => {})
    window.api
      .getGameAchievements(gameRef)
      .then((a) => !cancelled && setAchievements(a))
      .catch(() => {})
    window.api.getGamePrices(gameRef).then((p) => !cancelled && setPrices(p)).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [gameRef.platform, gameRef.platformId, gameRef.name])

  const hasStoreInfo =
    details?.ok &&
    (details.shortDescription || details.genres.length > 0 || details.screenshots.length > 0)

  return (
    <>
      {hasStoreInfo && details && (
        <section className="detail-section">
          <h3 className="section-title">Über das Spiel</h3>
          {details.genres.length > 0 && (
            <div className="genre-row">
              {details.genres.map((g) => (
                <span key={g} className="genre-chip">
                  {g}
                </span>
              ))}
              {details.metacritic !== null && (
                <span className="genre-chip metacritic">Metacritic {details.metacritic}</span>
              )}
            </div>
          )}
          {details.shortDescription && <p className="game-desc">{details.shortDescription}</p>}
          <div className="store-facts">
            {details.developers.length > 0 && (
              <span>
                <b>Entwickler:</b> {details.developers.join(', ')}
              </span>
            )}
            {details.publishers.length > 0 && (
              <span>
                <b>Publisher:</b> {details.publishers.join(', ')}
              </span>
            )}
            {details.releaseDate && (
              <span>
                <b>Erschienen:</b> {details.releaseDate}
              </span>
            )}
            {details.storeUrl && (
              <a href={details.storeUrl} target="_blank" rel="noreferrer">
                Im Steam-Store ansehen ↗
              </a>
            )}
          </div>
          {details.screenshots.length > 0 && (
            <div className="offer-row shot-row">
              {details.screenshots.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  className="shot-thumb"
                  loading="lazy"
                  onClick={() => setLightbox(url)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {prices && (prices.steam || prices.best || prices.historyLowCents !== null) && (
        <section className="detail-section">
          <h3 className="section-title">Preis</h3>
          <div className="price-row">
            {prices.steam && (
              <div className="price-card">
                <span className="price-label">Steam aktuell</span>
                <span className="price-value">
                  {formatEuro(prices.steam.priceCents)}
                  {prices.steam.discountPct > 0 && (
                    <>
                      {' '}
                      <s>{formatEuro(prices.steam.originalCents)}</s>{' '}
                      <span className="offer-badge discount">-{prices.steam.discountPct}%</span>
                    </>
                  )}
                </span>
              </div>
            )}
            {prices.best && (
              <a className="price-card clickable" href={prices.best.url} target="_blank" rel="noreferrer">
                <span className="price-label">Bester Preis ({prices.best.shop}) ↗</span>
                <span className="price-value">
                  {formatEuro(prices.best.priceCents)}
                  {prices.best.cut > 0 && (
                    <>
                      {' '}
                      <span className="offer-badge discount">-{prices.best.cut}%</span>
                    </>
                  )}
                </span>
              </a>
            )}
            {prices.historyLowCents !== null && (
              <div className="price-card">
                <span className="price-label">Historischer Tiefstpreis</span>
                <span className="price-value">{formatEuro(prices.historyLowCents)}</span>
              </div>
            )}
          </div>
          {prices.itadKeyMissing && (
            <p className="hint">
              Mit einem kostenlosen IsThereAnyDeal-Key (Einstellungen → Konten) siehst du hier
              zusätzlich den besten Preis über alle Shops und den historischen Tiefstpreis.
            </p>
          )}
        </section>
      )}

      {achievements && achievements.supported && <AchievementsSection result={achievements} />}

      {news && news.length > 0 && (
        <section className="detail-section">
          <h3 className="section-title">Neuigkeiten & Patchnotes</h3>
          <div className="news-list">
            {news.map((item) => (
              <a key={item.url} className="news-item" href={item.url} target="_blank" rel="noreferrer">
                <div className="news-head">
                  <span className="news-title">{item.title}</span>
                  <span className="news-date">{formatNewsDate(item.date)}</span>
                </div>
                {item.excerpt && <div className="news-excerpt">{item.excerpt}</div>}
                <div className="news-source">{item.feedLabel}</div>
              </a>
            ))}
          </div>
        </section>
      )}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" />
        </div>
      )}
    </>
  )
}

function AchievementsSection({ result }: { result: AchievementsResult }): JSX.Element {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? result.list : result.list.slice(0, 12)
  const percent = result.total > 0 ? Math.round((result.unlocked / result.total) * 100) : 0

  return (
    <section className="detail-section">
      <h3 className="section-title">Erfolge</h3>

      {result.keyMissing ? (
        <p className="hint">
          Dieses Spiel hat {result.total} Erfolge. Hinterlege unter Einstellungen → Konten deinen
          (kostenlosen) Steam-Web-API-Key, dann siehst du hier deinen Fortschritt.
        </p>
      ) : !result.ok ? (
        <p className="hint">⚠ {result.error}</p>
      ) : (
        <>
          <div className="ach-progress">
            <div className="ach-progress-bar">
              <div className="ach-progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <span className="ach-progress-text">
              {result.unlocked} / {result.total} freigeschaltet ({percent} %)
            </span>
          </div>
          <div className="ach-grid">
            {visible.map((a) => (
              <div
                key={a.name + a.iconUrl}
                className={`ach-item ${a.achieved ? 'done' : 'locked'}`}
                title={
                  a.description +
                  (a.globalPercent !== null ? ` — ${a.globalPercent} % aller Spieler` : '')
                }
              >
                <img src={a.achieved ? a.iconUrl : a.iconGrayUrl} alt="" loading="lazy" />
                <div className="ach-text">
                  <div className="ach-name">{a.name}</div>
                  {a.description && <div className="ach-desc">{a.description}</div>}
                  {a.globalPercent !== null && (
                    <div className="ach-global">{a.globalPercent} % aller Spieler</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {result.list.length > 12 && (
            <button className="btn small" onClick={() => setShowAll((s) => !s)}>
              {showAll ? 'Weniger anzeigen' : `Alle ${result.total} anzeigen`}
            </button>
          )}
        </>
      )}
    </section>
  )
}

export default GameDetailExtras
