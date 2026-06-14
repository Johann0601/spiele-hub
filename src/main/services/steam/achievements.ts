// Steam-Erfolge eines Spiels: Schema (Namen/Beschreibungen/Icons, deutsch),
// Freischalt-Stand des Nutzers und weltweite Freischalt-Quoten.
//
// Schema + Spieler-Stand brauchen den (kostenlosen) Steam-Web-API-Key.
// Die weltweiten Quoten sind öffentlich — damit erkennen wir auch OHNE Key,
// ob ein Spiel überhaupt Erfolge hat (für einen sinnvollen Hinweis in der UI).

import type { AchievementsResult, GameAchievement, GameRef } from '@shared/types'
import { getSteamApiKey, steamIdentity } from './webapi'

const API = 'https://api.steampowered.com/ISteamUserStats'

interface SchemaAchievement {
  name: string // interner API-Name (Schlüssel zum Verknüpfen)
  displayName: string
  description?: string
  icon: string
  icongray: string
}

// Schema + globale Quoten ändern sich selten -> pro Sitzung zwischenspeichern.
const schemaCache = new Map<number, SchemaAchievement[]>()
const globalCache = new Map<number, Map<string, number>>()

async function fetchSchema(key: string, appId: number): Promise<SchemaAchievement[]> {
  const cached = schemaCache.get(appId)
  if (cached) return cached
  const res = await fetch(`${API}/GetSchemaForGame/v2/?key=${key}&appid=${appId}&l=german`, {
    signal: AbortSignal.timeout(10000)
  })
  if (!res.ok) throw new Error(`Schema-Abruf fehlgeschlagen (HTTP ${res.status})`)
  const json = (await res.json()) as {
    game?: { availableGameStats?: { achievements?: SchemaAchievement[] } }
  }
  const list = json.game?.availableGameStats?.achievements ?? []
  schemaCache.set(appId, list)
  return list
}

/** Weltweite Freischalt-Quoten — öffentlich, KEIN Key nötig. */
async function fetchGlobalPercents(appId: number): Promise<Map<string, number>> {
  const cached = globalCache.get(appId)
  if (cached) return cached
  const map = new Map<string, number>()
  try {
    const res = await fetch(
      `${API}/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appId}`,
      { signal: AbortSignal.timeout(10000) }
    )
    if (res.ok) {
      const json = (await res.json()) as {
        // Achtung: "percent" kommt von Steam als STRING (z. B. "83.3").
        achievementpercentages?: { achievements?: { name: string; percent: number | string }[] }
      }
      for (const a of json.achievementpercentages?.achievements ?? []) {
        const pct = Number(a.percent)
        if (Number.isFinite(pct)) map.set(a.name, pct)
      }
    }
  } catch {
    /* Quoten sind nur Zusatz-Info */
  }
  globalCache.set(appId, map)
  return map
}

const NONE: AchievementsResult = { ok: true, supported: false, unlocked: 0, total: 0, list: [] }

/** Erfolge eines Spiels samt Freischalt-Stand des Nutzers laden. */
export async function getGameAchievements(game: GameRef): Promise<AchievementsResult> {
  // Erfolge gibt es nur für Steam-Spiele (der Stand hängt am Steam-Konto).
  if (game.platform !== 'steam') return NONE
  const appId = Number(game.platformId)
  if (!Number.isFinite(appId)) return NONE

  const key = getSteamApiKey()
  if (!key) {
    // Ohne Key wenigstens herausfinden, ob das Spiel Erfolge HAT — dann
    // zeigt die UI den Hinweis "Key hinterlegen" nur, wo es sich lohnt.
    const globals = await fetchGlobalPercents(appId)
    if (globals.size === 0) return NONE
    return { ok: true, supported: true, keyMissing: true, unlocked: 0, total: globals.size, list: [] }
  }

  try {
    const identity = steamIdentity()
    if (!identity) return { ...NONE, ok: false, error: 'Kein Steam-Konto auf diesem PC gefunden.' }

    const schema = await fetchSchema(key, appId)
    if (schema.length === 0) return NONE

    // Freischalt-Stand des Nutzers (respektiert die Steam-Privatsphäre).
    const res = await fetch(
      `${API}/GetPlayerAchievements/v1/?key=${key}&steamid=${identity.steamId}&appid=${appId}&l=german`,
      { signal: AbortSignal.timeout(10000) }
    )
    const json = (await res.json()) as {
      playerstats?: {
        success?: boolean
        error?: string
        achievements?: { apiname: string; achieved: number; unlocktime: number }[]
      }
    }
    const player = new Map(
      (json.playerstats?.achievements ?? []).map((a) => [a.apiname, a])
    )
    if (json.playerstats?.success === false && player.size === 0) {
      const reason = json.playerstats.error ?? ''
      return {
        ...NONE,
        ok: false,
        supported: true,
        error: /profile/i.test(reason)
          ? 'Dein Steam-Profil ist privat. Stelle in Steam unter Profil → Privatsphäre die „Spieldetails" auf öffentlich, dann klappt es.'
          : reason || 'Erfolge konnten nicht geladen werden.'
      }
    }

    const globals = await fetchGlobalPercents(appId)
    const list: GameAchievement[] = schema.map((s) => {
      const p = player.get(s.name)
      const percent = globals.get(s.name)
      return {
        name: s.displayName,
        description: s.description ?? '',
        iconUrl: s.icon,
        iconGrayUrl: s.icongray,
        achieved: (p?.achieved ?? 0) === 1,
        unlockTime: p && p.unlocktime > 0 ? p.unlocktime : null,
        globalPercent: percent !== undefined ? Math.round(percent * 10) / 10 : null
      }
    })
    // Freigeschaltete zuerst (neueste oben), dann die häufigsten gesperrten.
    list.sort((a, b) => {
      if (a.achieved !== b.achieved) return a.achieved ? -1 : 1
      if (a.achieved) return (b.unlockTime ?? 0) - (a.unlockTime ?? 0)
      return (b.globalPercent ?? 0) - (a.globalPercent ?? 0)
    })

    return {
      ok: true,
      supported: true,
      unlocked: list.filter((a) => a.achieved).length,
      total: list.length,
      list
    }
  } catch {
    return { ...NONE, ok: false, supported: true, error: 'Erfolge konnten nicht geladen werden.' }
  }
}
