// Steam-Web-API-Anbindung: Verwaltung des (kostenlosen) API-Keys und die
// Identität des lokal angemeldeten Steam-Kontos. Der Key wird verschlüsselt
// gespeichert; die SteamID64 + Profilname lesen wir direkt aus der lokalen
// Steam-Installation (config\loginusers.vdf) — kein Login in der App nötig.

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { SteamKeyStatus } from '@shared/types'
import { getStoredKey, setStoredKey } from '../keys'
import { resolveSteamPath } from './scanner'
import { parseVdf, getNode, getStr } from './vdf'

/** SteamID64 + Profilname des zuletzt angemeldeten Steam-Kontos. */
export function steamIdentity(): { steamId: string; personaName: string } | null {
  const steamPath = resolveSteamPath()
  if (!steamPath) return null
  const file = join(steamPath, 'config', 'loginusers.vdf')
  if (!existsSync(file)) return null
  try {
    const users = getNode(parseVdf(readFileSync(file, 'utf8')), 'users')
    if (!users) return null

    let best: { steamId: string; personaName: string } | null = null
    let bestTimestamp = -1
    for (const id64 of Object.keys(users)) {
      const entry = users[id64]
      if (typeof entry !== 'object') continue
      const persona = getStr(entry, 'PersonaName') ?? 'Steam-Konto'
      if (getStr(entry, 'MostRecent') === '1') return { steamId: id64, personaName: persona }
      const timestamp = parseInt(getStr(entry, 'Timestamp') ?? '0', 10) || 0
      if (timestamp > bestTimestamp) {
        bestTimestamp = timestamp
        best = { steamId: id64, personaName: persona }
      }
    }
    return best
  } catch {
    return null
  }
}

export function getSteamApiKey(): string | null {
  return getStoredKey('steamApiKey')
}

export function steamKeyStatus(): SteamKeyStatus {
  const identity = steamIdentity()
  return {
    connected: getSteamApiKey() !== null,
    personaName: identity?.personaName ?? null,
    steamId: identity?.steamId ?? null
  }
}

/** Key prüfen (Probe-Anfrage) und bei Erfolg verschlüsselt speichern. */
export async function setSteamApiKey(
  key: string
): Promise<{ ok: true; status: SteamKeyStatus } | { ok: false; error: string }> {
  const cleaned = key.trim()
  if (!/^[0-9A-F]{32}$/i.test(cleaned)) {
    return { ok: false, error: 'Das sieht nicht wie ein Steam-Key aus (32 Zeichen, Buchstaben A–F und Ziffern).' }
  }
  const identity = steamIdentity()
  if (!identity) {
    return { ok: false, error: 'Kein Steam-Konto auf diesem PC gefunden (loginusers.vdf fehlt).' }
  }
  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${cleaned}&steamids=${identity.steamId}`,
      { signal: AbortSignal.timeout(10000) }
    )
    if (res.status === 403) return { ok: false, error: 'Steam hat den Key abgelehnt — bitte prüfen.' }
    if (!res.ok) return { ok: false, error: `Steam antwortet nicht (HTTP ${res.status}).` }
  } catch {
    return { ok: false, error: 'Keine Verbindung zu Steam möglich — bist du online?' }
  }
  setStoredKey('steamApiKey', cleaned)
  return { ok: true, status: steamKeyStatus() }
}

export function clearSteamApiKey(): SteamKeyStatus {
  setStoredKey('steamApiKey', null)
  return steamKeyStatus()
}
