import { execFile } from 'child_process'

export interface RunningProcess {
  pid: number
  name: string // exe-Name, kleingeschrieben (immer lesbar, auch bei Anti-Cheat)
  path: string // absoluter Pfad, kleingeschrieben — kann bei geschützten Prozessen LEER sein
}

/**
 * Listet alle laufenden Prozesse mit Name UND (wenn möglich) Pfad.
 * Windows liefert das über Win32_Process (CIM/WMI). Anti-Cheat-geschützte
 * Spiele verbergen ihren Pfad (ExecutablePath ist dann leer) — den Namen aber
 * nicht. Darum behalten wir auch Prozesse ohne Pfad und gleichen über den Namen ab.
 */
export function listProcesses(): Promise<RunningProcess[]> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId, Name, ExecutablePath | ConvertTo-Json -Compress'
      ],
      { maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) {
          resolve([])
          return
        }
        try {
          const parsed = JSON.parse(stdout)
          // ConvertTo-Json liefert bei genau einem Treffer ein Objekt statt Array.
          const arr = Array.isArray(parsed) ? parsed : [parsed]
          resolve(
            arr
              .filter((p) => p && p.Name)
              .map((p) => ({
                pid: Number(p.ProcessId),
                name: String(p.Name).toLowerCase(),
                path: p.ExecutablePath ? String(p.ExecutablePath).toLowerCase() : ''
              }))
          )
        } catch {
          resolve([])
        }
      }
    )
  })
}

/** Beendet einen Prozessbaum hart (Spiel schließen). */
export function killProcessTree(pid: number): Promise<void> {
  return new Promise((resolve) => {
    execFile('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () =>
      resolve()
    )
  })
}
