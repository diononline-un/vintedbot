/**
 * ─── Auto Messages ────────────────────────────────────────────────────────────
 *
 * Handles three automated messaging scenarios:
 *
 *  P1-01  Like Messages   — when a buyer likes your item, send them a message
 *  P1-02  Accepted Offers — when a buyer accepts your counter, send a thank-you
 *  P1-03  Like Offers     — when a buyer likes your item, send them a discount offer
 *
 * Called from the automation-engine poll loop.
 */

import { syncStorage, localStore } from '@/storage'
import {
  getCurrentUserId,
  getNotifications,
  getOrCreateThread,
  sendMessage,
  sendPrivateOffer,
  throttledCall,
} from './vinted-api'
import type { VintedConversation, VintedNotification } from '@/lib/types'

// ─── Throttle constants ───────────────────────────────────────────────────────

const LIKE_MSG_COOLDOWN_MS  = 24 * 60 * 60 * 1000  // 24h per user
const LIKE_OFFER_COOLDOWN_MS = 48 * 60 * 60 * 1000  // 48h per user

// ─── P1-01 + P1-03: Process new item likes ───────────────────────────────────

export async function processLikeNotifications(): Promise<void> {
  const settings = await syncStorage.getSettings()
  const { likeMessages, likeOffer } = settings

  // Skip entirely if both features are disabled
  if (!likeMessages.enabled && !likeOffer.enabled) return

  const userId = getCurrentUserId()
  if (!userId) {
    console.warn('[VintedAuto] processLikeNotifications: could not get user ID')
    return
  }

  let notifications: VintedNotification[]
  try {
    notifications = await throttledCall(() => getNotifications(userId))
  } catch {
    return
  }

  // Filter to only new-like events we haven't handled yet
  const processed = await localStore.getProcessedNotificationIds()
  const likeNotifs = notifications.filter(
    n => isLikeType(n.type) && !processed.has(n.id)
  )

  if (likeNotifs.length === 0) return

  const newlyProcessed: string[] = []

  for (const notif of likeNotifs) {
    const { notifierId, notifierLogin, itemId, itemTitle, itemPrice, currency } = notif

    if (!notifierId || !itemId) {
      newlyProcessed.push(notif.id)
      continue
    }

    // ── P1-03: Like → discount offer (takes priority over message) ────────
    if (likeOffer.enabled) {
      const lastOfferAt = await localStore.getLikeSentAt(notifierId, 'offer')
      if (Date.now() - lastOfferAt > LIKE_OFFER_COOLDOWN_MS) {
        const offerPrice = roundToHalf(itemPrice * (1 - likeOffer.discountPercent / 100))
        const sent = await throttledCall(() =>
          sendPrivateOffer(itemId, notifierId, offerPrice, currency)
        )
        if (sent) {
          await localStore.markLikeSent(notifierId, 'offer')
          console.log(
            `[VintedAuto] Sent ${likeOffer.discountPercent}% discount offer to @${notifierLogin} for "${itemTitle}"`
          )
        }
        newlyProcessed.push(notif.id)
        continue  // don't also send a message if offer was sent
      }
    }

    // ── P1-01: Like → message ─────────────────────────────────────────────
    if (likeMessages.enabled) {
      const lastMsgAt = await localStore.getLikeSentAt(notifierId, 'message')
      if (Date.now() - lastMsgAt > LIKE_MSG_COOLDOWN_MS) {
        const text = applyTemplateVars(likeMessages.template, {
          buyer_name: notifierLogin,
          item_name: itemTitle,
          item_price: formatPrice(itemPrice, currency),
        })

        if (text.trim()) {
          // getOrCreateThread sends the initial message in the creation call
          const threadId = await throttledCall(() =>
            getOrCreateThread(itemId, notifierId, text)
          )
          if (threadId) {
            await localStore.markLikeSent(notifierId, 'message')
            console.log(
              `[VintedAuto] Sent like message to @${notifierLogin} for "${itemTitle}"`
            )
          }
        }
      }
    }

    newlyProcessed.push(notif.id)
  }

  if (newlyProcessed.length > 0) {
    await localStore.markNotificationsProcessed(newlyProcessed)
  }
}

// ─── P1-02: Accepted offer thank-you messages ─────────────────────────────────
//
// Called with the current conversations list from the main poll loop.
// Detects when an offer we counter-offered has been accepted by the buyer
// and sends the configured thank-you message.

export async function processAcceptedOfferMessages(
  conversations: VintedConversation[],
): Promise<void> {
  const settings = await syncStorage.getSettings()
  if (!settings.acceptedOfferMessage.enabled) return

  const template = settings.acceptedOfferMessage.template
  if (!template.trim()) return

  for (const conv of conversations) {
    const offer = conv.latestOffer
    if (!offer || offer.status !== 'accepted') continue

    // Only send once per conversation
    const alreadySent = await localStore.isAcceptedMessageSent(conv.id)
    if (alreadySent) continue

    const text = applyTemplateVars(template, {
      buyer_name: '',  // we don't have the buyer's name in VintedConversation yet — left blank
      item_name: conv.itemTitle,
      sale_price: formatPrice(offer.offerPrice, offer.currency),
    })

    if (!text.trim()) continue

    const sent = await throttledCall(() => sendMessage(conv.id, text))
    if (sent) {
      await localStore.markAcceptedMessageSent(conv.id)
      console.log(
        `[VintedAuto] Sent accepted-offer message for "${conv.itemTitle}" (conv ${conv.id})`
      )
    }
  }
}

// ─── Template variable substitution ──────────────────────────────────────────

function applyTemplateVars(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`@${key}`, value)
  }
  return result
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isLikeType(type: string): boolean {
  // Vinted uses different names across locales/versions
  return (
    type === 'new_item_liked' ||
    type === 'favourite_item' ||
    type === 'item_favourited' ||
    type === 'new_favourite'
  )
}

function roundToHalf(price: number): number {
  return Math.round(price * 2) / 2
}

function formatPrice(price: number, currency = 'EUR'): string {
  return `${price.toFixed(2)} ${currency}`
}
