import { useEffect, useMemo, useState } from 'react'
import type { GameCard, McLauncher, McProfile } from '@shared/types'
import { formatLastPlayed, formatPlaytime } from './format'

const LAUNCHER_LABEL: Record<McLauncher, string> = {
  modrinth: 'Modrinth',
  curseforge: 'CurseForge',
  ftb: 'FTB App'
}

function MinecraftView({ onBack }: { onBack?: () => void }): JSX.Element {
  const [profiles, setProfiles] = useState<McProfile[]>([])
  const [launcherIds, setLauncherIds] = useState<Partial<Record<McLauncher, number>>>({})
  const [loading, setLoading] = useState(true)

  const load = async (): Promise<void> => {
    setLoading(true)
    try {
      setProfiles(await window.api.getMcProfiles())
      // IDs der Launcher-Einträge laden, um "Launcher öffnen" anbieten zu können.
      const games: GameCard[] = await window.api.listGames()
      const ids: Partial<Record<McLauncher, number>> = {}
      for (const g of games) {
        if (g.kind === 'launcher' && (g.platform === 'modrinth' || g.platform === 'curseforge' || g.platform === 'ftb')) {
          ids[g.platform] = g.id
        }
      }
      setLauncherIds(ids)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // Nach Launcher gruppieren (Reihenfolge: Modrinth, CurseForge, FTB).
  const groups = useMemo(() => {
    const order: McLauncher[] = ['modrinth', 'curseforge', 'ftb']
    return order
      .map((l) => [l, profiles.filter((p) => p.launcher === l)] as const)
      .filter(([, list]) => list.length > 0)
  }, [profiles])

  return (
    <div className="app">
      <header className="topbar">
        {onBack && (
          <button className="btn" onClick={onBack}>
            ← Zurück
          </button>
        )}
        <div className="brand">
          <h1>🧱 Minecraft</h1>
          <span className="subtitle">{profiles.length} Modpacks/Profile</span>
        </div>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? 'Lese …' : '↻ Aktualisieren'}
        </button>
      </header>

      <main className="content">
        {!loading && profiles.length === 0 && (
          <div className="empty">Keine Profile gefunden (Modrinth, CurseForge, FTB App).</div>
        )}

        {groups.map(([launcher, list]) => (
          <section key={launcher} className="device-group">
            <div className="mc-group-header">
              <h2 className="section-title">{LAUNCHER_LABEL[launcher]}</h2>
              {launcherIds[launcher] !== undefined && (
                <button
                  className="btn tiny"
                  onClick={() => window.api.launchGame(launcherIds[launcher]!)}
                >
                  Launcher öffnen ↗
                </button>
              )}
            </div>
            <div className="device-list">
              {list.map((p) => (
                <ProfileRow key={p.instancePath} profile={p} />
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}

function ProfileRow({ profile }: { profile: McProfile }): JSX.Element {
  const meta = [
    profile.mcVersion && `MC ${profile.mcVersion}`,
    profile.modLoader,
    profile.modCount !== null && `${profile.modCount} Mods`
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="device-row">
      <div className="device-row-top">
        <div className="mc-profile">
          {profile.iconUrl ? (
            <img className="mc-icon" src={profile.iconUrl} alt="" />
          ) : (
            <span className="mc-icon fallback">🧱</span>
          )}
          <div className="device-main">
            <div className="device-name">{profile.name}</div>
            <div className="device-vendor">{meta}</div>
          </div>
        </div>
        <div className="mc-right">
          <div className="mc-meta">
            <span>Zuletzt: {formatLastPlayed(profile.lastPlayed)}</span>
            {profile.playtimeSec !== null && <span>Spielzeit: {formatPlaytime(profile.playtimeSec)}</span>}
          </div>
          <button
            className="btn tiny"
            title="Instanz-Ordner im Explorer öffnen"
            onClick={() => window.api.openMcFolder(profile.instancePath)}
          >
            📂
          </button>
        </div>
      </div>
    </div>
  )
}

export default MinecraftView
