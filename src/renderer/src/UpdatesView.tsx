import { useEffect, useState } from 'react'
import type { GameCard, UpdateEvent } from '@shared/types'
import { formatLastPlayed } from './format'

function UpdatesView(): JSX.Element {
  const [games, setGames] = useState<GameCard[]>([])
  const [history, setHistory] = useState<UpdateEvent[]>([])
  const [loading, setLoading] = useState(true)

  const load = async (): Promise<void> => {
    setLoading(true)
    try {
      // Frisch scannen, damit der Update-Status aktuell ist (liest nur lokale Dateien).
      const result = await window.api.scanLibrary()
      setGames(result.games)
      setHistory(await window.api.getUpdateHistory())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const pending = games.filter((g) => g.kind === 'game' && g.updatePending)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>⬆️ Updates</h1>
          <span className="subtitle">
            {pending.length === 0 ? 'alles aktuell' : `${pending.length} ausstehend`}
          </span>
        </div>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? 'Prüfe …' : '↻ Jetzt prüfen'}
        </button>
      </header>

      <main className="content">
        <div className="banner info">
          Die App erkennt ausstehende <strong>Steam</strong>-Updates über die lokalen
          Steam-Dateien und führt eine eigene Historie. Heruntergeladen/installiert wird
          ausschließlich über den Steam-Client. Für Epic-Spiele ist keine zuverlässige
          Update-Erkennung möglich.
        </div>

        <h2 className="section-title">Ausstehende Updates</h2>
        {pending.length === 0 ? (
          <div className="empty-inline">✓ Alle Steam-Spiele sind auf dem neuesten Stand.</div>
        ) : (
          <div className="device-list">
            {pending.map((g) => (
              <div key={g.id} className="device-row">
                <div className="device-row-top">
                  <div className="device-main">
                    <div className="device-name">
                      {g.name} <span className="tag update">Update verfügbar</span>
                    </div>
                    <div className="device-vendor">
                      Zuletzt aktualisiert: {formatLastPlayed(g.manifestLastUpdated)}
                    </div>
                  </div>
                  <button
                    className="btn small"
                    onClick={() => window.open(`steam://nav/games/details/${g.platformId}`, '_blank')}
                  >
                    In Steam aktualisieren ↗
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <h2 className="section-title" style={{ marginTop: 28 }}>
          Historie
        </h2>
        {history.length === 0 ? (
          <div className="empty-inline">
            Noch keine Einträge — sie entstehen, sobald Updates erkannt oder installiert werden.
          </div>
        ) : (
          <div className="history-list">
            {history.map((e) => (
              <div key={e.id} className="history-row">
                <span className={`history-type ${e.type}`}>
                  {e.type === 'installiert' ? '✓ installiert' : '⬆ erkannt'}
                </span>
                <span className="history-game">{e.gameName}</span>
                <span className="history-build">
                  {e.type === 'installiert' && e.oldBuild && e.newBuild
                    ? `Build ${e.oldBuild} → ${e.newBuild}`
                    : e.oldBuild
                      ? `Build ${e.oldBuild}`
                      : ''}
                </span>
                <span className="history-date">
                  {new Date(e.createdAt * 1000).toLocaleString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default UpdatesView
