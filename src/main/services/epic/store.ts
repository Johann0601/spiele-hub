// Epic-Store-Daten, die OHNE Login öffentlich abrufbar sind:
// die Gratisspiele der Woche (aktuell + angekündigt).

import type { EpicFreeGame } from '@shared/types'

const FREE_GAMES_URL =
  'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=de-DE&country=DE&allowCountries=DE'

// Die JSON-Struktur des Endpunkts (nur die Teile, die wir brauchen).
interface PromoWindow {
  startDate: string
  endDate: string
  discountSetting?: { discountType?: string; discountPercentage?: number }
}
interface StoreElement {
  title: string
  productSlug?: string | null
  urlSlug?: string | null
  offerType?: string
  catalogNs?: { mappings?: { pageSlug?: string; pageType?: string }[] }
  keyImages?: { type: string; url: string }[]
  price?: { totalPrice?: { fmtPrice?: { originalPrice?: string } } }
  promotions?: {
    promotionalOffers?: { promotionalOffers?: PromoWindow[] }[]
    upcomingPromotionalOffers?: { promotionalOffers?: PromoWindow[] }[]
  } | null
}

function toUnix(iso: string | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : Math.floor(t / 1000)
}

/** 100 %-Rabatt-Fenster heraussuchen (nur das ist wirklich "gratis"). */
function findFreeWindow(groups?: { promotionalOffers?: PromoWindow[] }[]): PromoWindow | null {
  for (const group of groups ?? []) {
    for (const offer of group.promotionalOffers ?? []) {
      const pct = offer.discountSetting?.discountPercentage
      // Epic kodiert "100 % Rabatt" je nach Feld als 0 (Restpreis) oder 100.
      if (pct === 0 || pct === 100) return offer
    }
  }
  return null
}

function pickImage(
  images: { type: string; url: string }[] | undefined,
  order: string[]
): string | null {
  for (const type of order) {
    const hit = images?.find((i) => i.type === type)
    if (hit) return hit.url
  }
  return images?.[0]?.url ?? null
}

const TALL_ORDER = ['OfferImageTall', 'Thumbnail', 'DieselStoreFrontTall', 'OfferImageWide']
const WIDE_ORDER = ['OfferImageWide', 'DieselStoreFrontWide', 'OfferImageTall', 'Thumbnail']

function storeUrl(el: StoreElement): string | null {
  const slug =
    el.productSlug?.replace(/\/home$/, '') ??
    el.catalogNs?.mappings?.find((m) => m.pageSlug)?.pageSlug ??
    el.urlSlug
  return slug ? `https://store.epicgames.com/de/p/${slug}` : null
}

/** Gratisspiele der Woche: aktuell kostenlose + angekündigte. */
export async function getEpicFreeGames(): Promise<EpicFreeGame[]> {
  const res = await fetch(FREE_GAMES_URL)
  if (!res.ok) throw new Error(`Epic-Store nicht erreichbar (HTTP ${res.status})`)
  const json = (await res.json()) as {
    data?: { Catalog?: { searchStore?: { elements?: StoreElement[] } } }
  }
  const elements = json.data?.Catalog?.searchStore?.elements ?? []
  const now = Math.floor(Date.now() / 1000)
  const result: EpicFreeGame[] = []

  for (const el of elements) {
    if (!el.title || !el.promotions) continue
    const current = findFreeWindow(el.promotions.promotionalOffers)
    const upcoming = findFreeWindow(el.promotions.upcomingPromotionalOffers)
    const win = current ?? upcoming
    if (!win) continue
    const start = toUnix(win.startDate)
    const end = toUnix(win.endDate)
    // "aktuell gratis" nur, wenn das Fenster wirklich JETZT läuft.
    const isNow = current !== null && (start === null || start <= now) && (end === null || end > now)
    result.push({
      title: el.title,
      status: isNow ? 'gratis' : 'demnaechst',
      startDate: start,
      endDate: end,
      originalPrice: el.price?.totalPrice?.fmtPrice?.originalPrice ?? null,
      coverUrl: pickImage(el.keyImages, TALL_ORDER),
      wideCoverUrl: pickImage(el.keyImages, WIDE_ORDER),
      storeUrl: storeUrl(el)
    })
  }

  // Aktuell Gratis zuerst, dann nach Startdatum.
  return result.sort(
    (a, b) =>
      (a.status === 'gratis' ? 0 : 1) - (b.status === 'gratis' ? 0 : 1) ||
      (a.startDate ?? 0) - (b.startDate ?? 0)
  )
}
