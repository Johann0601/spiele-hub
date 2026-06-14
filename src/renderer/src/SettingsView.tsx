import AccountsView from './AccountsView'
import ChangelogView from './ChangelogView'
import SystemView from './SystemView'
import type { Theme, View } from './App'

// Einstellungen: bündelt die selteneren Bereiche (Konten, System/Treiber,
// Changelog) und App-Optionen wie den Hell-/Dunkel-Modus.
function SettingsView({
  view,
  onNavigate,
  theme,
  onThemeChange
}: {
  view: View
  onNavigate: (v: View) => void
  theme: Theme
  onThemeChange: (t: Theme) => void
}): JSX.Element {
  const back = (): void => onNavigate('settings')

  if (view === 'settings-accounts') return <AccountsView onBack={back} />
  if (view === 'settings-system') return <SystemView onBack={back} />
  if (view === 'settings-changelog') return <ChangelogView onBack={back} />

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>⚙️ Einstellungen</h1>
        </div>
      </header>

      <main className="content">
        {/* App-Optionen */}
        <h2 className="section-title">Darstellung</h2>
        <div className="settings-row">
          <div className="settings-row-main">
            <div className="settings-row-title">Darkmode</div>
            <div className="settings-row-desc">
              Dunkles Erscheinungsbild (Standard). Ausschalten für den Hell-Modus.
            </div>
          </div>
          <label className="switch" title="Darkmode an/aus">
            <input
              type="checkbox"
              checked={theme === 'dark'}
              onChange={(e) => onThemeChange(e.target.checked ? 'dark' : 'light')}
            />
            <span className="slider" />
          </label>
        </div>

        {/* Bereiche */}
        <h2 className="section-title" style={{ marginTop: 26 }}>
          Bereiche
        </h2>
        <div className="settings-list">
          <button className="settings-row clickable" onClick={() => onNavigate('settings-accounts')}>
            <span className="settings-row-icon">👤</span>
            <div className="settings-row-main">
              <div className="settings-row-title">Konten</div>
              <div className="settings-row-desc">
                Epic-Konto sowie Keys für Steam-Erfolge, SteamGridDB-Cover und Preisvergleich
              </div>
            </div>
            <span className="settings-row-arrow">→</span>
          </button>
          <button className="settings-row clickable" onClick={() => onNavigate('settings-system')}>
            <span className="settings-row-icon">🖥️</span>
            <div className="settings-row-main">
              <div className="settings-row-title">System / Treiber</div>
              <div className="settings-row-desc">
                Hardware mit Treiberversionen, Nvidia-Update-Prüfung, Speicherplatz der Spiele
              </div>
            </div>
            <span className="settings-row-arrow">→</span>
          </button>
          <button
            className="settings-row clickable"
            onClick={() => onNavigate('settings-changelog')}
          >
            <span className="settings-row-icon">📜</span>
            <div className="settings-row-main">
              <div className="settings-row-title">Changelog</div>
              <div className="settings-row-desc">Was sich in der App geändert hat</div>
            </div>
            <span className="settings-row-arrow">→</span>
          </button>
        </div>
      </main>
    </div>
  )
}

export default SettingsView
