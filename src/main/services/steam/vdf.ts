// Mini-Parser für Valves "VDF"/"KeyValues"-Format.
// Beispiel:
//   "AppState"
//   {
//       "appid"      "440"
//       "name"       "Team Fortress 2"
//       "UserConfig" { "language" "german" }
//   }
// Ergebnis: verschachteltes Objekt { AppState: { appid: "440", name: "...", UserConfig: { ... } } }

export type VdfNode = { [key: string]: string | VdfNode }

export function parseVdf(text: string): VdfNode {
  let i = 0
  const n = text.length

  // Whitespace und //-Kommentare überspringen.
  function skipWhitespace(): void {
    while (i < n) {
      const c = text[i]
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
        i++
      } else if (c === '/' && text[i + 1] === '/') {
        while (i < n && text[i] !== '\n') i++
      } else {
        break
      }
    }
  }

  // Liest das nächste Token: ein "..."-String, eine geschweifte Klammer, oder ein nacktes Wort.
  function readToken(): string | null {
    skipWhitespace()
    if (i >= n) return null

    const c = text[i]
    if (c === '{' || c === '}') {
      i++
      return c
    }

    if (c === '"') {
      i++ // öffnendes Anführungszeichen überspringen
      let s = ''
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < n) {
          // Escape-Sequenzen (wichtig: Pfade enthalten \\ )
          const next = text[i + 1]
          if (next === 'n') s += '\n'
          else if (next === 't') s += '\t'
          else s += next // \\ -> \  und  \" -> "
          i += 2
        } else {
          s += text[i]
          i++
        }
      }
      i++ // schließendes Anführungszeichen überspringen
      return s
    }

    // nacktes Wort (selten, aber kommt vor)
    let s = ''
    while (i < n) {
      const ch = text[i]
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '{' || ch === '}' || ch === '"') break
      s += ch
      i++
    }
    return s
  }

  function parseObject(): VdfNode {
    const obj: VdfNode = {}
    while (true) {
      const key = readToken()
      if (key === null || key === '}') break
      const value = readToken()
      if (value === '{') {
        obj[key] = parseObject()
      } else if (value === null) {
        obj[key] = ''
        break
      } else {
        obj[key] = value
      }
    }
    return obj
  }

  const root: VdfNode = {}
  while (true) {
    const key = readToken()
    if (key === null) break
    if (key === '}') continue
    const value = readToken()
    if (value === '{') root[key] = parseObject()
    else if (value === null) {
      root[key] = ''
      break
    } else {
      root[key] = value
    }
  }
  return root
}

/**
 * Schlüssel suchen, ohne auf Groß-/Kleinschreibung zu achten.
 * Steam ist da inkonsistent (mal "Steam", mal "steam"), darum brauchen wir das.
 */
export function getCI(node: VdfNode | undefined, key: string): string | VdfNode | undefined {
  if (!node) return undefined
  const found = Object.keys(node).find((k) => k.toLowerCase() === key.toLowerCase())
  return found === undefined ? undefined : node[found]
}

/** Bequemer Zugriff auf einen verschachtelten Unter-Knoten (Objekt). */
export function getNode(node: VdfNode | undefined, key: string): VdfNode | undefined {
  const v = getCI(node, key)
  return v && typeof v === 'object' ? v : undefined
}

/** Bequemer Zugriff auf einen String-Wert. */
export function getStr(node: VdfNode | undefined, key: string): string | undefined {
  const v = getCI(node, key)
  return typeof v === 'string' ? v : undefined
}
