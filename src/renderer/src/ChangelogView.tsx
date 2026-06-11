import { useEffect, useState } from 'react'
import { CHANGELOG } from './changelog'

// Zeigt die Versions-Historie der App selbst (nicht der Spiele!).
function ChangelogView({ onBack }: { onBack?: () => void }): JSX.Element {
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    window.api.getAppVersion().then(setAppVersion).catch(() => {})
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        {onBack && (
          <button className="btn" onClick={onBack}>
            ← Zurück
          </button>
        )}
        <div className="brand">
          <h1>📜 Changelog</h1>
          <span className="subtitle">Was sich in der App geändert hat</span>
        </div>
      </header>

      <main className="content">
        <div className="changelog">
          {CHANGELOG.map((entry) => (
            <section key={entry.version} className="changelog-entry">
              <div className="changelog-head">
                <span className="changelog-version">v{entry.version}</span>
                <span className="changelog-title">{entry.title}</span>
                {entry.version === appVersion && (
                  <span className="changelog-current">deine Version</span>
                )}
                <span className="changelog-date">
                  {new Date(entry.date).toLocaleDateString('de-DE', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </span>
              </div>
              <ul className="changelog-list">
                {entry.changes.map((change, i) => (
                  <li key={i}>{change}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}

export default ChangelogView
