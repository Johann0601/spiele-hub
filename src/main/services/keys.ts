// Verschlüsselter Speicher für API-Schlüssel (Steam Web API, SteamGridDB).
// Gleiche Technik wie beim Epic-Konto: Windows-DPAPI über safeStorage,
// die Datei ist nur auf DIESEM PC und für DIESEN Nutzer lesbar.

import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

interface StoredKeys {
  steamApiKey?: string
  sgdbApiKey?: string
}

let cached: StoredKeys | undefined // undefined = noch nicht geladen

function keysFilePath(): string {
  return join(app.getPath('userData'), 'api-keys.bin')
}

function loadKeys(): StoredKeys {
  if (cached !== undefined) return cached
  cached = {}
  try {
    if (existsSync(keysFilePath())) {
      const data = readFileSync(keysFilePath())
      const raw = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(data)
        : data.toString('utf8')
      cached = JSON.parse(raw) as StoredKeys
    }
  } catch {
    cached = {} // beschädigt -> wie "keine Schlüssel"
  }
  return cached
}

function saveKeys(keys: StoredKeys): void {
  const raw = JSON.stringify(keys)
  const data = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(raw)
    : Buffer.from(raw, 'utf8')
  writeFileSync(keysFilePath(), data)
  cached = keys
}

export function getStoredKey(name: keyof StoredKeys): string | null {
  return loadKeys()[name] ?? null
}

export function setStoredKey(name: keyof StoredKeys, value: string | null): void {
  const keys = { ...loadKeys() }
  if (value) keys[name] = value
  else delete keys[name]
  saveKeys(keys)
}
