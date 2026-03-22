/**
 * ─── Automation Engine ────────────────────────────────────────────────────────
 *
 * The main poll loop. Runs in the content script via setInterval.
 * Every N seconds: fetch open offers → decide → act → log.
 */

import { syncStorage, localStore, sessionStore } from '@/storage'
import {
  getConversationsWithOffers,
  sendCounterOffer, acceptOffer, sendMessage, throttledCall,
} from './vinted-api'
import { decideOffer, describeDecision } from './offer-strategy'
import { processLikeNotifications, processAcceptedOfferMessages } from './auto-messages'
import { processRestocker } from './restocker'
import { processSmartAgent } from './smart-agent'
import type { OfferLogEntry, MessageLogEntry } from '@/lib/types'

let pollTimer: ReturnType<typeof setInterval> | null = null

// ─── Start the automation loop ────────────────────────────────────────────────

export async function startAutomation(): Promise<void> {
  if (pollTimer !== null) return  // already running

  await sessionStore.setRunning(true)
  console.log('[VintedAuto] Automation started')

  const settings = await syncStorage.getSettings()
  const intervalMs = (settings.offerRules.pollIntervalSeconds ?? 60) * 1000

  // Run immediately, then on interval
  await runPoll()
  pollTimer = setInterval(runPoll, intervalMs)
}

// ─── Stop the automation loop ─────────────────────────────────────────────────

export async function stopAutomation(): Promise<void> {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  await sessionStore.setRunning(false)
  console.log('[VintedAuto] Automation stopped')
}

export function isRunning(): boolean {
  return pollTimer !== null
}

// ─── Single poll cycle ────────────────────────────────────────────────────────

async function runPoll(): Promise<void> {
  try {
    await sessionStore.setLastPollAt(Date.now())
    const settings = await syncStorage.getSettings()
    if (!settings.automationEnabled) return

    const conversations = await throttledCall(getConversationsWithOffers)
    const offersToday = await sessionStore.getTotalOffersSentToday()

    // ── Auto messages: accepted-offer thank-you (P1-02) ───────────────────
    // Pass conversations to detect accepted offers before the main offer loop
    await processAcceptedOfferMessages(conversations)

    // ── Main offer decision loop ──────────────────────────────────────────
    const actedConversationIds = new Set<string>()

    for (const conv of conversations) {
      const offer = conv.latestOffer
      if (!offer || offer.status !== 'pending') continue

      const convState = await sessionStore.getConversationState(conv.id)

      // Skip if we acted on this conversation very recently (debounce 90s)
      if (Date.now() - convState.lastActionAt < 90_000) continue

      const decision = decideOffer(
        offer.offerPrice,
        conv.listingPrice,
        settings.offerRules,
        offersToday,
        convState.offersSentToConversation,
      )

      console.log('[VintedAuto]', describeDecision(decision, conv.itemTitle))

      // ── Execute decision ─────────────────────────────────────────────────
      let success = false

      if (decision.action === 'accept') {
        success = await throttledCall(() => acceptOffer(offer.id))
        if (success) {
          await logOffer({ conv, offer, action: 'accepted' })
          await sessionStore.updateConversationState(conv.id, { lastActionAt: Date.now() })
          actedConversationIds.add(conv.id)
        }

      } else if (decision.action === 'counter') {
        success = await throttledCall(() =>
          sendCounterOffer(conv.id, offer.id, decision.counterPrice, offer.currency)
        )
        if (success) {
          await logOffer({ conv, offer, action: 'countered', counterAmount: decision.counterPrice })
          await sessionStore.updateConversationState(conv.id, {
            offersSentToday: convState.offersSentToday + 1,
            offersSentToConversation: convState.offersSentToConversation + 1,
            lastActionAt: Date.now(),
          })
          actedConversationIds.add(conv.id)
        }

      } else if (decision.action === 'message') {
        const text = settings.messageTemplates.fallback
        if (text.trim()) {
          success = await throttledCall(() => sendMessage(conv.id, text))
          if (success) {
            await logMessage({ conversationId: conv.id, message: text, reason: 'fallback' })
            await sessionStore.updateConversationState(conv.id, {
              lastActionAt: Date.now(),
              lastMessageAt: Date.now(),
            })
            actedConversationIds.add(conv.id)
          }
        }
      }
    }
    // ── Like notifications: messages + discount offers (P1-01 + P1-03) ──
    // Run after the main offer loop so throttling doesn't block offer actions
    await processLikeNotifications()

    // ── Restocker: track sold items + auto-repost (P1-04) ─────────────────
    await processRestocker()

    // ── Smart Agent: AI-powered replies for unhandled conversations (P1-06) ─
    await processSmartAgent(conversations, actedConversationIds)

  } catch (err) {
    console.error('[VintedAuto] Poll error:', err)
  }
}

// ─── Logging helpers ──────────────────────────────────────────────────────────

async function logOffer({ conv, offer, action, counterAmount }: {
  conv: { id: string; itemId: string; itemTitle: string; listingPrice: number }
  offer: { offerPrice: number }
  action: OfferLogEntry['action']
  counterAmount?: number
}) {
  const entry: OfferLogEntry = {
    id: `${conv.id}-${Date.now()}`,
    conversationId: conv.id,
    itemId: conv.itemId,
    itemTitle: conv.itemTitle,
    listingPrice: conv.listingPrice,
    offerAmount: offer.offerPrice,
    counterAmount,
    action,
    sentAt: Date.now(),
  }
  await localStore.appendOffer(entry)
}

async function logMessage({ conversationId, message, reason }: {
  conversationId: string
  message: string
  reason: MessageLogEntry['reason']
}) {
  const entry: MessageLogEntry = {
    id: `${conversationId}-${Date.now()}`,
    conversationId,
    message,
    reason,
    sentAt: Date.now(),
  }
  await localStore.appendMessage(entry)
}
