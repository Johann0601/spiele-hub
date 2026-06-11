import { useEffect, useMemo, useState } from 'react'
import type { DeviceCategory, DeviceInfo, NvidiaUpdate } from '@shared/types'

const CATEGORY_ICON: Record<DeviceCategory, string> = {
  Grafikkarte: '🎞️',
  Prozessor: '🧠',
  Monitor: '🖥️',
  Maus: '🖱️',
  Tastatur: '⌨️',
  Audio: '🔊',
  Netzwerk: '🌐',
  Bluetooth: '🔵',
  Speicher: '💾'
}

const COLLAPSED_KEY = 'system-collapsed-categories'

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

/** Bytes -> "931 GB" bzw. "1,86 TB". */
function formatBytes(bytes: number): string {
  const gib = bytes / 1024 ** 3
  if (gib >= 1024) return `${(gib / 1024).toFixed(2).replace('.', ',')} TB`
  return `${Math.round(gib)} GB`
}

function SystemView(): JSX.Element {
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed)
  const [updates, setUpdates] = useState<Record<string, NvidiaUpdate | null>>({})

  const load = async (): Promise<void> => {
    setLoading(true)
    try {
      const devs = await window.api.getDevices()
      setDevices(devs)

      const nvidiaGpus = devs.filter((d) => d.isNvidiaGpu)
      setUpdates(Object.fromEntries(nvidiaGpus.map((d) => [d.name, null])))
      for (const d of nvidiaGpus) {
        window.api
          .checkNvidiaUpdate(d.name, d.driverVersion)
          .then((u) => setUpdates((prev) => ({ ...prev, [d.name]: u })))
          .catch(() =>
            setUpdates((prev) => ({
              ...prev,
              [d.name]: {
                ok: false,
                installedVersion: null,
                latestVersion: null,
                updateAvailable: false,
                downloadUrl: null,
                releaseDate: null,
                error: 'Abfrage fehlgeschlagen.'
              }
            }))
          )
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]))
  }, [collapsed])

  const toggle = (cat: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  // Geräte nach Kategorie gruppieren (in Anzeige-Reihenfolge).
  const groups = useMemo(() => {
    const map = new Map<DeviceCategory, DeviceInfo[]>()
    for (const d of devices) {
      const list = map.get(d.category) ?? []
      list.push(d)
      map.set(d.category, list)
    }
    return [...map.entries()]
  }, [devices])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>🖥️ System / Treiber</h1>
          <span className="subtitle">{devices.length} Geräte</span>
        </div>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? 'Lese …' : '↻ Aktualisieren'}
        </button>
      </header>

      <main className="content">
        <div className="banner info">
          Zeigt die <strong>installierte</strong> Treiberversion pro Gerät. Eine Update-Prüfung
          ist <strong>nur für Nvidia-GPUs</strong> zuverlässig möglich – für AMD, Intel, Logitech
          &amp; Co. lässt sich die neueste Version nicht verlässlich automatisch ermitteln.
        </div>

        {loading && devices.length === 0 && <div className="empty">Lese Geräte …</div>}

        {groups.map(([category, list]) => {
          const isCollapsed = collapsed.has(category)
          return (
            <section key={category} className="device-group">
              <button className="group-header" onClick={() => toggle(category)}>
                <span className={`caret ${isCollapsed ? 'closed' : ''}`}>▾</span>
                <span className="group-title">
                  {CATEGORY_ICON[category]} {category}
                </span>
                <span className="group-count">{list.length}</span>
              </button>
              {!isCollapsed && (
                <div className="device-list">
                  {list.map((d, i) => (
                    <DeviceRow
                      key={`${category}-${i}`}
                      device={d}
                      update={d.isNvidiaGpu ? updates[d.name] : undefined}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </main>
    </div>
  )
}

function DeviceRow({
  device,
  update
}: {
  device: DeviceInfo
  update?: NvidiaUpdate | null
}): JSX.Element {
  return (
    <div className="device-row">
      <div className="device-row-top">
        <div className="device-main">
          <div className="device-name">{device.name}</div>
          <div className="device-vendor">{device.vendor}</div>
        </div>
        {!device.storage && device.driverVersion && (
          <div className="device-driver">
            <div className="driver-version">{device.driverVersion}</div>
            {device.driverDate && <div className="driver-date">{device.driverDate}</div>}
          </div>
        )}
      </div>

      {device.storage && <StorageBar storage={device.storage} />}
      {device.isNvidiaGpu && <NvidiaUpdateRow update={update} />}
    </div>
  )
}

function StorageBar({ storage }: { storage: { totalBytes: number; freeBytes: number } }): JSX.Element {
  const { totalBytes, freeBytes } = storage
  const used = Math.max(0, totalBytes - freeBytes)
  const pct = totalBytes ? Math.round((used / totalBytes) * 100) : 0
  return (
    <div className="storage">
      <div className="storage-track">
        <div className={`storage-fill ${pct >= 90 ? 'full' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="storage-text">
        {formatBytes(freeBytes)} frei von {formatBytes(totalBytes)} · {pct}% belegt
      </div>
    </div>
  )
}

function NvidiaUpdateRow({ update }: { update?: NvidiaUpdate | null }): JSX.Element | null {
  if (update === undefined) return null
  if (update === null) {
    return <div className="nvidia-update loading">⏳ Prüfe auf Treiber-Update …</div>
  }
  if (!update.ok) {
    return (
      <div className="nvidia-update muted">
        Update-Status nicht ermittelbar{update.error ? ` (${update.error})` : ''}
      </div>
    )
  }
  if (update.updateAvailable) {
    const openApp = async (): Promise<void> => {
      const ok = await window.api.openNvidiaApp()
      if (!ok) window.open('https://www.nvidia.com/Download/index.aspx', '_blank')
    }
    return (
      <div className="nvidia-update available">
        <span>
          ⬆ Update verfügbar: <strong>{update.latestVersion}</strong>
          {update.releaseDate ? ` (${update.releaseDate})` : ''} · installiert:{' '}
          {update.installedVersion}
        </span>
        <button className="btn small" onClick={openApp}>
          In NVIDIA App öffnen ↗
        </button>
      </div>
    )
  }
  return (
    <div className="nvidia-update ok">✓ Treiber aktuell (Version {update.installedVersion})</div>
  )
}

export default SystemView
