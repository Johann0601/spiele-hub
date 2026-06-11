import { readdirSync, type Dirent } from 'fs'
import { join } from 'path'

// Generische exe-Namen, die NICHT als "das Spiel" gelten sollen (sonst Fehl-Treffer).
const DENY_EXACT = new Set([
  'launcher.exe',
  'crashreportclient.exe',
  'crashpad_handler.exe',
  'crashhandler.exe',
  'unitycrashhandler64.exe',
  'unitycrashhandler32.exe',
  'dxsetup.exe',
  'oalinst.exe',
  'notification_helper.exe'
])
const DENY_SUBSTRINGS = [
  'easyanticheat',
  'battleye',
  'beservice',
  'vcredist',
  'vc_redist',
  'directx',
  'prereq',
  'redist',
  'setup',
  'unins',
  'crashreport',
  'crashpad',
  'webhelper',
  'cefprocess',
  'handler'
]

function isGeneric(nameLower: string): boolean {
  if (DENY_EXACT.has(nameLower)) return true
  return DENY_SUBSTRINGS.some((s) => nameLower.includes(s))
}

/**
 * Sammelt die "echten" Spiel-exe-Namen (kleingeschrieben) aus dem Installationsordner.
 * Diese dienen als Fallback, um Anti-Cheat-geschützte Spiele zu erkennen, deren
 * Programm-Pfad sich nicht auslesen lässt — der Prozess-NAME ist trotzdem lesbar.
 *
 * Begrenzt Tiefe und Zahl besuchter Ordner, damit riesige Spiele-Ordner den Scan
 * nicht ausbremsen (die Spiel-exe liegt fast immer weit oben).
 */
export function findGameExeNames(installDir: string, maxDepth = 4, maxDirs = 1500): string[] {
  const names = new Set<string>()
  let dirsVisited = 0

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth || dirsVisited >= maxDirs) return
    dirsVisited++
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (dirsVisited >= maxDirs) break
      if (e.isDirectory()) {
        walk(join(dir, e.name), depth + 1)
      } else if (e.name.toLowerCase().endsWith('.exe')) {
        const n = e.name.toLowerCase()
        if (!isGeneric(n)) names.add(n)
      }
    }
  }

  walk(installDir, 0)
  return [...names]
}
