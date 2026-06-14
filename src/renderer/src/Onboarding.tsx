import { useEffect, useState } from 'react'
import type { SteamKeyStatus } from '@shared/types'

// Erste-Schritte-Pop-up beim allerersten Start: fragt nach dem (optionalen)
// Steam-Web-API-Key für die beste Erfahrung. Cover & Preise sind bereits
// eingebaut — daher bleibt nur dieser eine, persönliche Schlüssel sinnvoll.
// Alles ist überspringbar und später unter Einstellungen → Konten nachholbar.
function Onboarding({
  onClose,
  onOpenAccounts
}: {
  onClose: () => void
  onOpenAccounts: () => void
}): JSX.Element {
  const [status, setStatus] = useState<SteamKeyStatus | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    window.api.getSteamKeyStatus().then(setStatus).catch(() => {})
  }, [])

  const finish = async (): Promise<void> => {
    // Ohne Eingabe (oder schon hinterlegt) einfach schließen.
    if (status?.connected || !key.trim()) {
      onClose()
      return
    }
    setBusy(true)
    setMsg(null)
    const r = await window.api.setSteamKey(key)
    setBusy(false)
    if (r.ok) {
      setMsg({ kind: 'ok', text: 'Key gespeichert — viel Spaß mit buffd!' })
      setTimeout(onClose, 900)
    } else {
      setMsg({ kind: 'error', text: r.error })
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal onboard">
        <h2>Willkommen bei buffd 🎮</h2>
        <p className="onboard-intro">
          Schön, dass du dabei bist! buffd bündelt deine Spiele aus Steam, Epic &amp; Co. an einem
          Ort. Schönere Cover und Preisvergleiche sind schon eingebaut — für ein paar persönliche
          Extras lohnt sich ein kostenloser Steam-Schlüssel.
        </p>

        <div className="onboard-card">
          <div className="onboard-card-title">
            🏆 Steam-Web-API-Key <span className="onboard-opt">empfohlen · optional</span>
          </div>
          <p>
            Schaltet deine Steam-Erfolge auf den Detailseiten frei und zeigt deinen kompletten
            Besitz-Katalog — auch nicht installierte Spiele.
          </p>
          {status?.connected ? (
            <div className="account-message ok">
              ✓ Schon hinterlegt{status.personaName ? ` für ${status.personaName}` : ''} — alles
              bereit.
            </div>
          ) : (
            <>
              <ol className="account-steps">
                <li>
                  Öffne{' '}
                  <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer">
                    steamcommunity.com/dev/apikey
                  </a>{' '}
                  und melde dich an (als Domain reicht <code>localhost</code>).
                </li>
                <li>Kopiere den Key (32 Zeichen) und füge ihn hier ein.</li>
              </ol>
              <input
                type="text"
                className="account-code-input"
                placeholder="Steam-Web-API-Key einfügen"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') finish()
                }}
              />
              {msg && <div className={`account-message ${msg.kind}`}>{msg.text}</div>}
            </>
          )}
        </div>

        <p className="onboard-note">
          Alles ist optional — Schlüssel und weitere Konten (z. B. Epic) kannst du jederzeit später
          unter{' '}
          <button
            className="link-btn"
            onClick={() => {
              onClose()
              onOpenAccounts()
            }}
          >
            Einstellungen → Konten
          </button>{' '}
          eintragen.
        </p>

        <div className="onboard-actions">
          <button className="btn" onClick={onClose}>
            Überspringen
          </button>
          <button className="btn primary" onClick={finish} disabled={busy}>
            {busy ? 'Speichere …' : status?.connected || !key.trim() ? 'Los geht’s' : 'Speichern & loslegen'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Onboarding
