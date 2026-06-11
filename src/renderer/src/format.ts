/** Sekunden -> "12 h 34 min" bzw. "34 min" bzw. "—". */
export function formatPlaytime(totalSec: number): string {
  if (!totalSec || totalSec <= 0) return '—'
  const totalMin = Math.floor(totalSec / 60)
  const hours = Math.floor(totalMin / 60)
  const minutes = totalMin % 60
  if (hours === 0) return `${minutes} min`
  return `${hours} h ${minutes} min`
}

/** Unix-Sekunden -> lesbares Datum (deutsch), oder "nie". */
export function formatLastPlayed(unixSec: number | null): string {
  if (!unixSec) return 'nie'
  return new Date(unixSec * 1000).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}
