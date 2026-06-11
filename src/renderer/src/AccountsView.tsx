import { useEffect, useState } from 'react'
import type { EpicAccountStatus } from '@shared/types'

// Konten-Bereich: externe Konten mit der App VERBINDEN (kein eigenes
// App-Login). Aktuell: Epic Games — lesend für Spielzeiten & Bibliothek.
function AccountsView(): JSX.Element {
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>👤 Konten</h1>
          <span className="subtitle">Externe Konten mit der App verbinden</span>
        </div>
      </header>

      <main className="content">
        <EpicAccountCard />
        <p className="hint">
          Die App liest nur Daten (Spielzeiten, Bibliothek) — sie verändert nie etwas an deinen
          Konten. Dein Passwort gibst du ausschließlich auf der offiziellen Epic-Seite ein; die App
          bekommt es nie zu sehen. Die Zugangsdaten werden mit Windows-Verschlüsselung nur auf
          diesem PC gespeichert.
        </p>
      </main>
    </div>
  )
}

function EpicAccountCard(): JSX.Element {
  const [status, setStatus] = useState<EpicAccountStatus | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    window.api.getEpicStatus().then(setStatus).catch(() => {})
  }, [])

  const connect = async (): Promise<void> => {
    if (!code.trim()) return
    setBusy(true)
    setMessage(null)
    const result = await window.api.epicLogin(code)
    setBusy(false)
    if (result.ok) {
      setStatus(result.status)
      setCode('')
      setMessage({ kind: 'ok', text: 'Verbunden! Spielzeiten werden jetzt abgeglichen …' })
      const sync = await window.api.syncEpicPlaytime()
      setMessage(
        sync.ok
          ? {
              kind: 'ok',
              text:
                sync.updatedGames > 0
                  ? `Fertig — Spielzeit von ${sync.updatedGames} Spiel(en) von Epic übernommen.`
                  : 'Fertig — deine Spielzeiten waren schon aktuell.'
            }
          : { kind: 'error', text: sync.error ?? 'Spielzeit-Abgleich fehlgeschlagen.' }
      )
    } else {
      setMessage({ kind: 'error', text: result.error })
    }
  }

  const syncNow = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    const sync = await window.api.syncEpicPlaytime()
    setBusy(false)
    setMessage(
      sync.ok
        ? {
            kind: 'ok',
            text:
              sync.updatedGames > 0
                ? `Spielzeit von ${sync.updatedGames} Spiel(en) aktualisiert.`
                : 'Alles aktuell — keine Änderungen.'
          }
        : { kind: 'error', text: sync.error ?? 'Abgleich fehlgeschlagen.' }
    )
  }

  const disconnect = async (): Promise<void> => {
    setStatus(await window.api.epicLogout())
    setMessage({ kind: 'ok', text: 'Epic-Konto getrennt. Getrackte Spielzeiten bleiben erhalten.' })
  }

  return (
    <section className="account-card">
      <div className="account-head">
        <span className="account-icon">🛒</span>
        <div>
          <div className="account-title">Epic Games</div>
          <div className="account-state">
            {status === null
              ? 'lade …'
              : status.connected
                ? `✓ Verbunden als ${status.displayName}`
                : 'Nicht verbunden'}
          </div>
        </div>
      </div>

      {status?.connected ? (
        <div className="account-actions">
          <button className="btn" onClick={syncNow} disabled={busy}>
            {busy ? 'Gleiche ab …' : '↻ Spielzeit jetzt abgleichen'}
          </button>
          <button className="btn danger" onClick={disconnect} disabled={busy}>
            Trennen
          </button>
        </div>
      ) : (
        status !== null && (
          <div className="account-connect">
            <ol className="account-steps">
              <li>
                Klicke auf <b>„Epic-Login öffnen"</b> und melde dich im Browser bei Epic an (ganz
                normal, mit 2FA falls aktiv).
              </li>
              <li>
                Danach zeigt dir Epic eine Textseite mit deinem Code — kopiere den Wert hinter{' '}
                <code>"authorizationCode"</code> (32 Zeichen).
              </li>
              <li>Füge den Code hier ein und klicke auf „Verbinden".</li>
            </ol>
            <div className="account-actions">
              <button className="btn" onClick={() => window.api.openEpicLogin()}>
                🌐 Epic-Login öffnen
              </button>
              <input
                type="text"
                className="account-code-input"
                placeholder="authorizationCode hier einfügen"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') connect()
                }}
              />
              <button className="btn primary" onClick={connect} disabled={busy || !code.trim()}>
                {busy ? 'Verbinde …' : 'Verbinden'}
              </button>
            </div>
          </div>
        )
      )}

      {message && <div className={`account-message ${message.kind}`}>{message.text}</div>}

      {status?.connected && (
        <p className="account-note">
          Die Epic-Spielzeit wird beim App-Start automatisch übernommen. Dein selbst getracktes
          Spielen zählt wie gewohnt obendrauf — nichts wird doppelt gezählt.
        </p>
      )}
    </section>
  )
}

export default AccountsView
