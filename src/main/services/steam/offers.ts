// Aktuelle Steam-Angebote über den öffentlichen Store-Endpunkt —
// kein API-Schlüssel, kein Login nötig.

import type { SteamOffer } from '@shared/types'

const FEATURED_URL = 'https://store.steampowered.com/api/featuredcategories?cc=de&l=german'

interface FeaturedItem {
  id: number
  type?: number // 0 = Spiel/App, 1 = Paket, 2 = Bundle
  name: string
  discounted?: boolean
  discount_percent?: number
  original_price?: number // in Cent
  final_price?: number // in Cent
  currency?: string
  header_image?: string
  large_capsule_image?: string
}

/** Store-URL je nach Artikel-Typ (Pakete/Bundles haben eigene Pfade). */
function itemUrl(item: FeaturedItem): string {
  const kind = item.type === 1 ? 'sub' : item.type === 2 ? 'bundle' : 'app'
  return `https://store.steampowered.com/${kind}/${item.id}/`
}

/** Die aktuellen Steam-Sales ("Specials" der Store-Startseite). */
export async function getSteamOffers(): Promise<SteamOffer[]> {
  const res = await fetch(FEATURED_URL)
  if (!res.ok) throw new Error(`Steam-Store nicht erreichbar (HTTP ${res.status})`)
  const json = (await res.json()) as { specials?: { items?: FeaturedItem[] } }
  const items = json.specials?.items ?? []

  return items
    .filter(
      (i) =>
        i.discounted &&
        (i.discount_percent ?? 0) > 0 &&
        // Ohne Bild sieht die Kachel kaputt aus -> weglassen.
        Boolean(i.header_image ?? i.large_capsule_image)
    )
    .map((i) => ({
      appId: i.id,
      name: i.name,
      discountPercent: i.discount_percent ?? 0,
      originalPriceCents: i.original_price ?? null,
      finalPriceCents: i.final_price ?? null,
      currency: i.currency ?? 'EUR',
      coverUrl: i.header_image ?? i.large_capsule_image ?? null,
      storeUrl: itemUrl(i)
    }))
    .sort((a, b) => b.discountPercent - a.discountPercent)
}
