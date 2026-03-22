/**
 * ─── Offer Strategy — pure decision logic ─────────────────────────────────────
 *
 * No side effects. All functions take data in, return a decision out.
 * Easy to unit-test independently of the browser.
 */

import type { OfferRules } from '@/lib/types'

export type OfferDecision =
  | { action: 'accept' }
  | { action: 'counter'; counterPrice: number }
  | { action: 'message'; reason: 'limit_hit' }
  | { action: 'skip';    reason: string }

/**
 * Decide what to do with an incoming offer.
 *
 * @param offerPrice      - buyer's offered price
 * @param listingPrice    - seller's current listing price
 * @param rules           - user's configured offer rules
 * @param offersToday     - total offers sent today (across all conversations)
 * @param offersToConv    - offers sent to this specific conversation
 */
export function decideOffer(
  offerPrice: number,
  listingPrice: number,
  rules: OfferRules,
  offersToday: number,
  offersToConv: number,
): OfferDecision {
  if (!rules.enabled) {
    return { action: 'skip', reason: 'automation_disabled' }
  }

  if (listingPrice <= 0) {
    return { action: 'skip', reason: 'invalid_listing_price' }
  }

  const offerPercent = (offerPrice / listingPrice) * 100

  // ── Auto-accept threshold ──────────────────────────────────────────────────
  if (offerPercent >= rules.autoAcceptAbovePercent) {
    return { action: 'accept' }
  }

  // ── Daily limit check ──────────────────────────────────────────────────────
  if (offersToday >= rules.maxOffersPerDay) {
    return rules.fallbackToMessage
      ? { action: 'message', reason: 'limit_hit' }
      : { action: 'skip', reason: 'daily_limit_reached' }
  }

  // ── Per-conversation limit check ───────────────────────────────────────────
  if (offersToConv >= rules.maxOffersPerConversation) {
    return rules.fallbackToMessage
      ? { action: 'message', reason: 'limit_hit' }
      : { action: 'skip', reason: 'conversation_limit_reached' }
  }

  // ── Counter-offer ──────────────────────────────────────────────────────────
  const counterPrice = getCounterPrice(listingPrice, rules.counterAtPercent)
  return { action: 'counter', counterPrice }
}

/**
 * Calculate counter price rounded to nearest 0.50.
 */
export function getCounterPrice(listingPrice: number, percent: number): number {
  const raw = listingPrice * (percent / 100)
  return Math.round(raw * 2) / 2  // round to nearest 0.50
}

/**
 * Human-readable summary of a decision (for the activity log).
 */
export function describeDecision(decision: OfferDecision, itemTitle: string): string {
  switch (decision.action) {
    case 'accept':
      return `✅ Accepted offer on "${itemTitle}"`
    case 'counter':
      return `↩ Countered "${itemTitle}" at €${decision.counterPrice.toFixed(2)}`
    case 'message':
      return `💬 Sent fallback message for "${itemTitle}"`
    case 'skip':
      return `⏭ Skipped "${itemTitle}" (${decision.reason})`
  }
}
