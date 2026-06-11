import os from 'os'
import type { NvidiaUpdate } from '@shared/types'

// NVIDIAs eigene (inoffizielle, aber langjährig stabile) Endpunkte:
//  - lookupValueSearch: Liste aller GPUs -> Produkt-ID (pfid)
//  - AjaxDriverService:  neueste Treiberversion für eine pfid + OS
const LOOKUP_URL = 'https://www.nvidia.com/Download/API/lookupValueSearch.aspx?TypeID=3'
const DRIVER_URL =
  'https://gfwsl.geforce.com/services_toolkit/services/com/nvidia/services/AjaxDriverService.php'

/**
 * Übersetzt die Windows-Treiberversion in die echte Nvidia-Nummer.
 * Beispiel: "32.0.15.9649" -> letzte zwei Teile "15"+"9649" = "159649"
 *           -> letzte 5 Ziffern "59649" -> "596.49".
 */
export function decodeNvidiaVersion(windowsVersion: string): string | null {
  const parts = windowsVersion.split('.')
  if (parts.length < 4) return null
  const digits = (parts[2] + parts[3]).replace(/\D/g, '')
  if (digits.length < 5) return null
  const last5 = digits.slice(-5)
  return `${last5.slice(0, 3)}.${last5.slice(3)}`
}

/** OS-ID für NVIDIAs Abfrage: Windows 11 (Build >= 22000) = 135, sonst Windows 10 = 57. */
function getOsId(): number {
  const build = parseInt(os.release().split('.')[2] ?? '0', 10) || 0
  return build >= 22000 ? 135 : 57
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#174;|&reg;/g, '®')
}

/** Löst den GPU-Namen über NVIDIAs Lookup-Liste in die Produkt-ID (pfid) auf. */
async function fetchPfid(gpuName: string): Promise<number | null> {
  const res = await fetch(LOOKUP_URL)
  const xml = await res.text()

  const target = normalizeName(gpuName)
  const targetNoVendor = target.replace(/^nvidia\s+/, '')

  const re = /<LookupValue[^>]*>\s*<Name>(.*?)<\/Name>\s*<Value>(.*?)<\/Value>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const name = normalizeName(decodeXmlEntities(m[1]))
    const value = parseInt(m[2], 10)
    if (!value) continue
    if (name === target || name.replace(/^nvidia\s+/, '') === targetNoVendor) {
      return value
    }
  }
  return null
}

interface LatestDriver {
  version: string
  downloadUrl: string
  releaseDate: string
}

/** Fragt die neueste Game-Ready-Treiberversion für eine pfid ab. */
async function fetchLatestDriver(pfid: number, osId: number): Promise<LatestDriver | null> {
  const params = new URLSearchParams({
    func: 'DriverManualLookup',
    pfid: String(pfid),
    osID: String(osId),
    languageCode: '1033',
    beta: '0',
    isWHQL: '1',
    dltype: '-1',
    dch: '1', // DCH-Treiber (Standard auf modernem Windows 10/11)
    sort1: '0',
    numberOfResults: '1'
  })
  const res = await fetch(`${DRIVER_URL}?${params.toString()}`)
  const data = (await res.json()) as { IDS?: { downloadInfo?: Record<string, string> }[] }
  const info = data?.IDS?.[0]?.downloadInfo
  if (!info?.Version) return null
  return {
    version: String(info.Version),
    downloadUrl: info.DownloadURL ? String(info.DownloadURL) : '',
    releaseDate: info.ReleaseDateTime ? String(info.ReleaseDateTime) : ''
  }
}

/**
 * Vollständige Update-Prüfung für eine Nvidia-GPU.
 * @param gpuName        Gerätename, z. B. "NVIDIA GeForce RTX 4070"
 * @param windowsVersion installierte Windows-Treiberversion, z. B. "32.0.15.9649"
 */
export async function checkNvidiaUpdate(
  gpuName: string,
  windowsVersion: string
): Promise<NvidiaUpdate> {
  const installedVersion = decodeNvidiaVersion(windowsVersion)
  const fail = (error: string): NvidiaUpdate => ({
    ok: false,
    installedVersion,
    latestVersion: null,
    updateAvailable: false,
    downloadUrl: null,
    releaseDate: null,
    error
  })

  try {
    const pfid = await fetchPfid(gpuName)
    if (!pfid) return fail('GPU bei NVIDIA nicht gefunden.')

    const latest = await fetchLatestDriver(pfid, getOsId())
    if (!latest) return fail('Keine Treiberdaten erhalten.')

    const updateAvailable = installedVersion
      ? parseFloat(latest.version) > parseFloat(installedVersion)
      : false

    return {
      ok: true,
      installedVersion,
      latestVersion: latest.version,
      updateAvailable,
      downloadUrl: latest.downloadUrl || null,
      releaseDate: latest.releaseDate || null
    }
  } catch {
    return fail('Abfrage fehlgeschlagen (Internetverbindung?).')
  }
}
