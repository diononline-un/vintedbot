/**
 * ─── Restocker ─────────────────────────────────────────────────────────────────
 *
 * P1-04: Detect newly sold items and optionally repost them.
 *
 * On each poll:
 *  1. Fetch the user's sold items list from the Vinted API
 *  2. For each new sold item not yet tracked, store it in local storage
 *  3. If autoRepost is enabled and delayHours has elapsed, repost the item
 *
 * Called from the automation-engine poll loop.
 */

import { syncStorage, localStore } from '@/storage'
import { getCurrentUserId, getUserItems, repostItem, throttledCall } from './vinted-api'
import type { SoldItemEntry } from '@/lib/types'

export async function processRestocker(): Promise<void> {
  const settings = await syncStorage.getSettings()
  if (!settings.restocker.enabled) return

  const userId = getCurrentUserId()
  if (!userId) {
    console.warn('[VintedAuto] processRestocker: could not get user ID')
    return
  }

  // ── Step 1: Fetch sold items ──────────────────────────────────────────────
  let soldItems
  try {
    soldItems = await throttledCall(() => getUserItems(userId, 'sold_out'))
  } catch {
    return
  }

  if (soldItems.length === 0) return

  const tracked = await localStore.getSoldItems()
  const trackedIds = new Set(tracked.map(i => i.id))

  // ── Step 2: Track newly sold items ───────────────────────────────────────
  for (const item of soldItems) {
    if (!trackedIds.has(item.id)) {
      const entry: SoldItemEntry = {
        id: item.id,
        title: item.title,
        price: item.price,
        currency: item.currency,
        thumbnailUrl: item.thumbnailUrl,
        soldAt: Date.now(),
      }
      await localStore.upsertSoldItem(entry)
      console.log(`[VintedAuto] Restocker: detected sold item "${item.title}"`)
    }
  }

  // ── Step 3: Auto-repost if enabled ───────────────────────────────────────
  if (!settings.restocker.autoRepost) return

  const delayMs = settings.restocker.delayHours * 60 * 60 * 1000
  const now = Date.now()

  // Re-read after upserts
  const current = await localStore.getSoldItems()

  for (const entry of current) {
    // Skip already reposted
    if (entry.repostedAt) continue

    // Skip if delay hasn't elapsed
    if (now - entry.soldAt < delayMs) continue

    // Only repost items we still see in the current sold list
    const stillSold = soldItems.some(i => i.id === entry.id)
    if (!stillSold) continue

    const newId = await throttledCall(() => repostItem(entry.id))
    if (newId) {
      await localStore.markSoldItemReposted(entry.id, newId === 'ok' ? undefined : newId)
      console.log(`[VintedAuto] Restocker: reposted "${entry.title}"`)
    }
  }
}
