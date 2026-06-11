// Epic-Konto-Anbindung (nur LESEND): Login per Autorisierungs-Code,
// verschlüsselte Token-Speicherung und Spielzeit-Abgleich.
//
// Wir nutzen denselben OAuth-Client wie der offizielle Epic-Launcher
// ("launcherAppClient2") — exakt der Weg, den Legendary, Heroic und
// Playnite seit Jahren gehen. Epic sieht uns also wie den eigenen
// Launcher; das Passwort wird IMMER nur bei Epic im Browser eingegeben.

import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { EpicAccountStatus, EpicSyncResult } from '@shared/types'
import { listPlatformPlaytimes, setImportedPlaytime } from '../../db'

const CLIENT_ID = '34a02cf8f4414e29b15921876da36f9a'
const CLIENT_SECRET = 'daafbccc737745039dffe53d94fc76cf'
const BASIC_AUTH = 'basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')

const OAUTH_TOKEN_URL =
  'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token'
const PLAYTIME_URL = (accountId: string): string =>
  `https://library-service.live.use1a.on.epicgames.com/library/api/public/playtime/account/${accountId}/all`

/** Diese Seite zeigt nach dem Epic-Login den Autorisierungs-Code als JSON an. */
export const EPIC_LOGIN_URL =
  'https://www.epicgames.com/id/login?redirectUrl=' +
  encodeURIComponent(
    `https://www.epicgames.com/id/api/redirect?clientId=${CLIENT_ID}&responseType=code`
  )

// --- Token-Speicherung -------------------------------------------------------

interface StoredAuth {
  accountId: string
  displayName: string
  refreshToken: string
}

// Aktives Zugriffs-Token nur im Arbeitsspeicher (Lebensdauer ~8 h).
let accessToken: string | null = null
let accessTokenExpiresAt = 0 // Unix-Sekunden
let cachedAuth: StoredAuth | null | undefined // undefined = noch nicht geladen

function authFilePath(): string {
  return join(app.getPath('userData'), 'epic-account.bin')
}

/** Refresh-Token mit Windows-Bordmitteln (DPAPI) verschlüsselt ablegen. */
function saveAuth(auth: StoredAuth): void {
  const raw = JSON.stringify(auth)
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(raw)
    : Buffer.from(raw, 'utf8') // Notnagel — auf Windows praktisch nie nötig
  writeFileSync(authFilePath(), data)
  cachedAuth = auth
}

function loadAuth(): StoredAuth | null {
  if (cachedAuth !== undefined) return cachedAuth
  cachedAuth = null
  try {
    if (existsSync(authFilePath())) {
      const data = readFileSync(authFilePath())
      const raw = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(data)
        : data.toString('utf8')
      cachedAuth = JSON.parse(raw) as StoredAuth
    }
  } catch {
    cachedAuth = null // beschädigt/nicht entschlüsselbar -> wie "nicht verbunden"
  }
  return cachedAuth
}

// --- OAuth-Aufrufe -----------------------------------------------------------

interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token: string
  account_id: string
  displayName?: string
  errorMessage?: string
}

async function requestToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: BASIC_AUTH,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ ...body, token_type: 'eg1' }).toString()
  })
  const json = (await res.json()) as TokenResponse
  if (!res.ok || !json.access_token) {
    throw new Error(json.errorMessage ?? `Epic-Anmeldung fehlgeschlagen (HTTP ${res.status})`)
  }
  return json
}

function rememberSession(t: TokenResponse): void {
  accessToken = t.access_token
  accessTokenExpiresAt = Math.floor(Date.now() / 1000) + t.expires_in - 60
  saveAuth({
    accountId: t.account_id,
    // displayName fehlt bei refresh_token-Antworten manchmal -> alten behalten
    displayName: t.displayName ?? loadAuth()?.displayName ?? 'Epic-Konto',
    refreshToken: t.refresh_token // Epic rotiert das Token -> immer neu speichern
  })
}

/** Gültiges Zugriffs-Token liefern; bei Bedarf per Refresh-Token erneuern. */
export async function getAccessToken(): Promise<{ token: string; accountId: string }> {
  const auth = loadAuth()
  if (!auth) throw new Error('Kein Epic-Konto verbunden.')
  if (accessToken && Date.now() / 1000 < accessTokenExpiresAt) {
    return { token: accessToken, accountId: auth.accountId }
  }
  const t = await requestToken({ grant_type: 'refresh_token', refresh_token: auth.refreshToken })
  rememberSession(t)
  return { token: t.access_token, accountId: t.account_id }
}

// --- Öffentliche API (IPC) ---------------------------------------------------

export function epicAccountStatus(): EpicAccountStatus {
  const auth = loadAuth()
  return { connected: auth !== null, displayName: auth?.displayName ?? null }
}

/** Den im Browser erhaltenen Autorisierungs-Code gegen Tokens eintauschen. */
export async function epicLoginWithCode(code: string): Promise<EpicAccountStatus> {
  const cleaned = code.trim().replace(/^"|"$/g, '')
  if (!/^[0-9a-f]{32}$/i.test(cleaned)) {
    throw new Error('Das sieht nicht wie ein Code aus — bitte nur den 32-stelligen Wert einfügen.')
  }
  const t = await requestToken({ grant_type: 'authorization_code', code: cleaned })
  rememberSession(t)
  return epicAccountStatus()
}

export function epicLogout(): void {
  accessToken = null
  cachedAuth = null
  try {
    rmSync(authFilePath(), { force: true })
  } catch {
    /* ignorieren */
  }
}

/**
 * Spielzeit-Abgleich: Holt die offiziellen Epic-Spielzeiten und hebt unseren
 * Startwert so an, dass Gesamt (Startwert + eigene Sitzungen) = Epic-Wert.
 * Es wird nur ERHÖHT, nie gesenkt — selbst Getracktes geht nie verloren.
 */
export async function syncEpicPlaytime(): Promise<EpicSyncResult> {
  try {
    const { token, accountId } = await getAccessToken()
    const res = await fetch(PLAYTIME_URL(accountId), {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) throw new Error(`Spielzeit-Abruf fehlgeschlagen (HTTP ${res.status})`)
    const items = (await res.json()) as { artifactId: string; totalTime: number }[]
    const byArtifact = new Map(items.map((i) => [i.artifactId, i.totalTime]))

    let updated = 0
    for (const game of listPlatformPlaytimes('epic')) {
      const epicTotal = byArtifact.get(game.platformId)
      if (epicTotal === undefined) continue
      const newImported = epicTotal - game.sessionSec
      if (newImported > game.importedSec) {
        setImportedPlaytime(game.id, newImported)
        updated++
      }
    }
    return { ok: true, updatedGames: updated }
  } catch (err) {
    return { ok: false, updatedGames: 0, error: String(err instanceof Error ? err.message : err) }
  }
}
