import { listProcesses, killProcessTree, type RunningProcess } from './processList'
import {
  listTrackableGames,
  startSession,
  endSession,
  closeOrphanSessions,
  type TrackableGame
} from '../db'
import type { RunningGame } from '@shared/types'

const POLL_INTERVAL_MS = 5000
// Wie viele aufeinanderfolgende "nicht gesehen"-Polls, bevor wir eine Sitzung beenden.
// Puffer gegen kurzes Verschwinden (Ladebildschirme, Neustart von Unterprozessen).
const MISS_GRACE = 2

interface ActiveSession {
  sessionId: number
  startedAt: number
  missCount: number
}

type SendFn = (channel: string, payload?: unknown) => void

// gameId -> laufende Sitzung
const active = new Map<number, ActiveSession>()
let timer: NodeJS.Timeout | null = null
let send: SendFn = () => {}

/** Normalisiert einen Ordnerpfad zum Vergleich (klein, mit abschließendem Trenner). */
function dirPrefix(dir: string): string {
  return dir.toLowerCase().replace(/[\\/]+$/, '') + '\\'
}

/**
 * Gehört ein laufender Prozess zu diesem Spiel?
 *  - Pfad lesbar  -> muss im Installationsordner liegen (präzise).
 *  - Pfad verborgen (Anti-Cheat) -> über den exe-Namen abgleichen.
 */
function processMatchesGame(p: RunningProcess, prefix: string, exeNames: string[]): boolean {
  if (p.path) return p.path.startsWith(prefix)
  return exeNames.includes(p.name)
}

/** Liefert die zu einem Spiel gehörenden laufenden Prozesse. */
function matchingProcesses(processes: RunningProcess[], game: TrackableGame): RunningProcess[] {
  const prefix = dirPrefix(game.installDir)
  return processes.filter((p) => processMatchesGame(p, prefix, game.exeNames))
}

/** Startet den Hintergrund-Wächter. */
export function startTracker(sendFn: SendFn): void {
  send = sendFn
  closeOrphanSessions() // evtl. Reste eines früheren Absturzes bereinigen
  if (timer) return
  timer = setInterval(poll, POLL_INTERVAL_MS)
  void poll() // sofort einmal laufen, nicht erst nach 5s
}

export function stopTracker(): void {
  if (timer) clearInterval(timer)
  timer = null
}

async function poll(): Promise<void> {
  const games = listTrackableGames()
  if (games.length === 0) return

  const processes = await listProcesses()
  const now = Math.floor(Date.now() / 1000)
  let changed = false

  for (const game of games) {
    const isRunning = matchingProcesses(processes, game).length > 0
    const current = active.get(game.id)

    if (isRunning) {
      if (!current) {
        // Neuer Spielstart erkannt -> Sitzung eröffnen.
        const sessionId = startSession(game.id, now)
        active.set(game.id, { sessionId, startedAt: now, missCount: 0 })
        changed = true
      } else {
        current.missCount = 0
      }
    } else if (current) {
      current.missCount++
      if (current.missCount >= MISS_GRACE) {
        // Spiel ist beendet -> Sitzung abschließen.
        endSession(current.sessionId, now, current.startedAt)
        active.delete(game.id)
        changed = true
      }
    }
  }

  // Live-Status an die Oberfläche schicken.
  const running: RunningGame[] = [...active.entries()].map(([gameId, s]) => ({
    gameId,
    startedAt: s.startedAt
  }))
  send('tracker:update', running)

  // Wenn eine Sitzung begonnen/geendet hat, haben sich Summen/last_played geändert.
  if (changed) send('games:refresh')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Schließt ein laufendes Spiel: beendet alle Prozesse unter seinem Install-Ordner.
 * HARTNÄCKIG über mehrere Sekunden — denn manche Spiele (z. B. Epic-Titel wie
 * Rocket League) starten in Stufen: erst ein Zwischen-Launcher, dann die Spiel-exe.
 * Wird "Schließen" sehr früh gedrückt, fängt die Schleife die später auftauchende
 * Spiel-exe trotzdem noch ab.
 * Rückgabe: true, wenn mindestens ein Prozess beendet wurde.
 */
export async function closeGame(gameId: number): Promise<boolean> {
  const game = listTrackableGames().find((g) => g.id === gameId)
  if (!game) return false

  let killedAny = false
  const MAX_ATTEMPTS = 10 // ~12 Sekunden Gesamtfenster
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const processes = await listProcesses()
    const targets = matchingProcesses(processes, game)
    if (targets.length > 0) {
      for (const t of targets) await killProcessTree(t.pid)
      killedAny = true
    } else if (killedAny) {
      break // schon beendet und jetzt sauber -> fertig
    }
    await sleep(1200)
  }
  return killedAny
}
