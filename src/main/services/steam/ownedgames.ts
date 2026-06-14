// Kompletter Steam-Besitz-Katalog (auch NICHT installierte Spiele) über die
// offizielle Web-API. Liefert pro Spiel die Gesamt-Spielzeit UND — anders als
// Epic — einen echten "zuletzt gespielt"-Zeitstempel (rtime_last_played).
//   Voraussetzung: hinterlegter Web-API-Key + Spieldetails-Privatsphäre "öffentlich".

import { getSteamApiKey, steamIdentity } from './webapi'

export interface SteamOwnedGame {
  appId: number
  name: string
  playtimeSec: number
  lastPlayed: number | null // Unix-Sek. (0 = nie -> null)
}

interface OwnedGamesResponse {
  response?: {
    games?: {
      appid: number
      name?: string
      playtime_forever?: number // Minuten
      rtime_last_played?: number // Unix-Sek.
    }[]
  }
}

/**
 * Alle besessenen Steam-Spiele. Gibt null zurück, wenn kein Key/Konto vorhanden
 * ist oder die Anfrage scheitert (z. B. private Spieldetails) — der Aufrufer
 * behandelt das als "kein Steam-Katalog verfügbar".
 */
export async function getSteamOwnedGames(): Promise<SteamOwnedGame[] | null> {
  const key = getSteamApiKey()
  const identity = steamIdentity()
  if (!key || !identity) return null

  try {
    const url =
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` +
      `?key=${key}&steamid=${identity.steamId}` +
      `&include_appinfo=1&include_played_free_games=1&format=json`
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    const json = (await res.json()) as OwnedGamesResponse
    const games = json.response?.games
    if (!games) return null // private Spieldetails -> response.games fehlt

    return games
      .filter((g) => g.name) // ohne Namen nicht darstellbar
      .map((g) => ({
        appId: g.appid,
        name: g.name as string,
        playtimeSec: (g.playtime_forever ?? 0) * 60,
        lastPlayed: g.rtime_last_played ? g.rtime_last_played : null
      }))
  } catch {
    return null
  }
}
