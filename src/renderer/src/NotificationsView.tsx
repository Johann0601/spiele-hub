import type { GameCard, NvidiaUpdate } from '@shared/types'

// Benachrichtigungen: alles, was mit Updates zu tun hat, an einem Ort —
// App-Update (bereit zum Neustart), Steam-Spiel-Updates, Nvidia-Treiber.
function NotificationsView({
  appUpdateVersion,
  pendingGames,
  nvidia
}: {
  appUpdateVersion: string | null
  pendingGames: GameCard[]
  nvidia: NvidiaUpdate | null
}): JSX.Element {
  const count =
    (appUpdateVersion ? 1 : 0) + pendingGames.length + (nvidia?.updateAvailable ? 1 : 0)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>🔔 Benachrichtigungen</h1>
          <span className="subtitle">
            {count === 0 ? 'nichts offen' : `${count} offen`}
          </span>
        </div>
      </header>

      <main className="content">
        {count === 0 && (
          <div className="empty">
            Alles ruhig — App, Spiele und Treiber sind auf dem neuesten Stand. ✓
          </div>
        )}

        <div className="settings-list">
          {/* App-Update: schon heruntergeladen, wartet auf Neustart */}
          {appUpdateVersion && (
            <div className="settings-row notif-attention">
              <span className="settings-row-icon">⬆️</span>
              <div className="settings-row-main">
                <div className="settings-row-title">
                  Spiele Hub {appUpdateVersion} ist bereit
                </div>
                <div className="settings-row-desc">
                  Das App-Update wurde bereits heruntergeladen — die App startet zum Installieren
                  nur kurz neu.
                </div>
              </div>
              <button className="btn primary small" onClick={() => window.api.installAppUpdate()}>
                Jetzt neu starten
              </button>
            </div>
          )}

          {/* Nvidia-Treiber */}
          {nvidia?.updateAvailable && (
            <div className="settings-row notif-attention">
              <span className="settings-row-icon">🎞️</span>
              <div className="settings-row-main">
                <div className="settings-row-title">
                  Nvidia-Treiber {nvidia.latestVersion} verfügbar
                </div>
                <div className="settings-row-desc">
                  Installiert ist {nvidia.installedVersion}. Das Update machst du wie gewohnt in
                  der NVIDIA App — die Hub-App installiert keine Treiber.
                </div>
              </div>
              <button
                className="btn small"
                onClick={async () => {
                  const opened = await window.api.openNvidiaApp()
                  if (!opened && nvidia.downloadUrl) window.open(nvidia.downloadUrl, '_blank')
                }}
              >
                NVIDIA App öffnen
              </button>
            </div>
          )}

          {/* Steam-Spiel-Updates */}
          {pendingGames.map((g) => (
            <div key={g.id} className="settings-row">
              <span className="settings-row-icon">🎮</span>
              <div className="settings-row-main">
                <div className="settings-row-title">{g.name}</div>
                <div className="settings-row-desc">Für dieses Spiel steht ein Steam-Update aus.</div>
              </div>
              <button
                className="btn small"
                onClick={() => window.open(`steam://nav/games/details/${g.platformId}`, '_blank')}
              >
                In Steam aktualisieren ↗
              </button>
            </div>
          ))}
        </div>

        <p className="hint">
          Hier landet alles rund um Updates: die App selbst, deine Steam-Spiele und der
          Nvidia-Treiber. Spiel-Updates werden alle 10 Minuten im Hintergrund neu geprüft.
        </p>
      </main>
    </div>
  )
}

export default NotificationsView
