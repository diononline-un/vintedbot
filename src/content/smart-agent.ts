/**
 * ─── Smart Agent ───────────────────────────────────────────────────────────────
 *
 * P1-06: Automatically reply to buyer messages using the Claude API.
 *
 * Trigger: a conversation has a new buyer message that wasn't triggered
 *          by an offer/like action and hasn't been replied to yet.
 *
 * Safety gates:
 *   - Feature toggle (settings.smartAgent.enabled)
 *   - Requires valid Anthropic API key
 *   - Per-conversation opt-out (stored in local storage)
 *   - Daily reply limit (default 50)
 *   - Dry-run mode: logs intent without sending
 *   - Never replies if the last message was from the seller
 *
 * Called from the automation-engine poll loop.
 */

import { syncStorage, localStore } from '@/storage'
import {
  getThreadMessages, sendMessage, throttledCall, getCurrentUserId,
} from './vinted-api'
import type { VintedConversation } from '@/lib/types'

const CLAUDE_API = 'https://api.anthropic.com/v1/messages'
const MAX_TOKENS = 150
const TEMPERATURE = 0.7

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function processSmartAgent(
  conversations: VintedConversation[],
  actedConversationIds: Set<string>,   // conversations where we already acted this poll
): Promise<void> {
  const settings = await syncStorage.getSettings()
  const { smartAgent } = settings
  if (!smartAgent.enabled) return

  const apiKey = settings.anthropicApiKey
  if (!apiKey) return

  const userId = getCurrentUserId()
  if (!userId) return

  // Daily limit check
  const todayReplies = await getTodaySmartAgentReplies()
  if (todayReplies >= smartAgent.dailyReplyLimit) {
    console.log(`[VintedAuto] Smart Agent: daily limit (${smartAgent.dailyReplyLimit}) reached`)
    return
  }

  let repliesSent = 0

  for (const conv of conversations) {
    // Skip if we already took an offer/message action on this conversation
    if (actedConversationIds.has(conv.id)) continue

    // Skip opt-outs
    if (await localStore.isSmartAgentOptedOut(conv.id)) continue

    // Daily limit during this loop
    if (todayReplies + repliesSent >= smartAgent.dailyReplyLimit) break

    // Fetch last few messages to determine if buyer is waiting for a reply
    const messages = await throttledCall(() => getThreadMessages(conv.id, 5))
    if (messages.length === 0) continue

    const lastMsg = messages[messages.length - 1]

    // Skip if last message was from the seller (us)
    if (lastMsg.senderId === userId) continue

    // Skip if we already replied in the session (check conversation state)
    const convState = await (await import('@/storage')).sessionStore.getConversationState(conv.id)
    if (convState.lastMessageAt && convState.lastMessageAt > lastMsg.createdAt) continue

    // Build the Claude prompt
    const systemPrompt = buildSystemPrompt(settings.smartAgent.personalityPrompt, conv, smartAgent.minPriceFloor)
    const userContent = buildUserContent(messages)

    if (smartAgent.dryRun) {
      console.log(`[VintedAuto] Smart Agent (DRY RUN) — would reply to "${conv.itemTitle}":`, userContent)
      continue
    }

    // Call Claude API
    const reply = await callClaude(apiKey, systemPrompt, userContent)
    if (!reply) continue

    // Send the reply
    const sent = await throttledCall(() => sendMessage(conv.id, reply))
    if (sent) {
      repliesSent++
      await incrementSmartAgentReplies()
      await (await import('@/storage')).sessionStore.updateConversationState(conv.id, {
        lastMessageAt: Date.now(),
        lastActionAt: Date.now(),
      })
      console.log(`[VintedAuto] Smart Agent: replied to "${conv.itemTitle}"`)
    }
  }
}

// ─── Claude API call ──────────────────────────────────────────────────────────

async function callClaude(
  apiKey: string,
  system: string,
  userContent: string,
): Promise<string | null> {
  try {
    const res = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system,
        messages: [{ role: 'user', content: userContent }],
      }),
    })

    if (!res.ok) {
      console.warn('[VintedAuto] Smart Agent: Claude API error', res.status)
      return null
    }

    const data = await res.json()
    return data?.content?.[0]?.text?.trim() ?? null
  } catch (err) {
    console.warn('[VintedAuto] Smart Agent: fetch error', err)
    return null
  }
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildSystemPrompt(
  personality: string,
  conv: VintedConversation,
  minPrice: number,
): string {
  const parts = [
    personality,
    `\nYou are handling a conversation about the item "${conv.itemTitle}" listed at ${conv.listingPrice.toFixed(2)}.`,
    'Keep your reply short (1-3 sentences). Never use bullet points or markdown.',
    'Respond in the same language as the buyer.',
  ]
  if (minPrice > 0) {
    parts.push(`Never agree to sell for less than ${minPrice.toFixed(2)}.`)
  }
  return parts.join(' ')
}

function buildUserContent(messages: { body: string; senderId: string }[]): string {
  if (messages.length <= 1) {
    return messages[0]?.body ?? ''
  }
  // Build a conversation transcript for context
  const transcript = messages
    .map((m, i) => {
      const role = i === messages.length - 1 ? 'Buyer (latest)' : (i % 2 === 0 ? 'Buyer' : 'Seller')
      return `${role}: ${m.body}`
    })
    .join('\n')
  return `Conversation so far:\n${transcript}\n\nPlease reply to the buyer's latest message.`
}

// ─── Daily reply counter ──────────────────────────────────────────────────────

async function getTodaySmartAgentReplies(): Promise<number> {
  const todayKey = new Date().toISOString().slice(0, 10)  // YYYY-MM-DD
  const data = await chrome.storage.local.get('smartAgentDailyCount') as Record<string, unknown>
  const counts = (data['smartAgentDailyCount'] as Record<string, number>) ?? {}
  return counts[todayKey] ?? 0
}

async function incrementSmartAgentReplies(): Promise<void> {
  const todayKey = new Date().toISOString().slice(0, 10)
  const data = await chrome.storage.local.get('smartAgentDailyCount') as Record<string, unknown>
  const counts = (data['smartAgentDailyCount'] as Record<string, number>) ?? {}
  counts[todayKey] = (counts[todayKey] ?? 0) + 1
  // Prune old days (keep last 7)
  const keys = Object.keys(counts).sort()
  if (keys.length > 7) keys.slice(0, keys.length - 7).forEach(k => delete counts[k])
  await chrome.storage.local.set({ smartAgentDailyCount: counts })
}
