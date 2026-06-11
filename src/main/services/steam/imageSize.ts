import { readFileSync } from 'fs'

export interface ImageSize {
  width: number
  height: number
}

/**
 * Liest die Pixel-Maße eines Bildes aus seinem Header — ohne das ganze Bild
 * zu dekodieren. Unterstützt PNG und JPEG (das nutzt Steams librarycache).
 * Gibt null zurück, wenn das Format unbekannt/unlesbar ist.
 */
export function readImageSize(filePath: string): ImageSize | null {
  let buf: Buffer
  try {
    buf = readFileSync(filePath)
  } catch {
    return null
  }
  if (buf.length < 24) return null

  // --- PNG: Signatur \x89PNG\r\n\x1a\n, dann IHDR mit Breite/Höhe (Big-Endian) ---
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }

  // --- JPEG: beginnt mit FF D8, dann Segmente durchlaufen bis zum SOF-Marker ---
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++
        continue
      }
      const marker = buf[offset + 1]
      // SOF-Marker (Start Of Frame) enthalten die Maße. C4/C8/CC sind KEINE Maße.
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isSof) {
        const height = buf.readUInt16BE(offset + 5)
        const width = buf.readUInt16BE(offset + 7)
        return { width, height }
      }
      // andernfalls dieses Segment anhand seiner Längenangabe überspringen
      const segLength = buf.readUInt16BE(offset + 2)
      if (segLength < 2) break
      offset += 2 + segLength
    }
  }

  return null
}
