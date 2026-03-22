/**
 * ─── 3-Tier Storage Abstraction ───────────────────────────────────────────────
 *
 * sync    → offer rules, settings, message templates (syncs across Chrome profiles)
 * local   → offer log, message log, inbox notes (persistent, 10MB, on-device)
 * session → live queue, conversation state, running flag (fast, cleared on close)
 */

import type {
  Settings, OfferRules, MessageTemplates,
  LikeMessageSettings, AcceptedOfferMessageSettings, LikeOfferSettings,
  RestockerSettings, SmartAgentSettings, SoldItemEntry,
  OfferLogEntry, MessageLogEntry, InboxNote,
  ConversationState, AutoStats,
} from '@/lib/types'

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_OFFER_RULES: OfferRules = {
  enabled: true,
  counterAtPercent: 85,
  autoAcceptAbovePercent: 92,
  maxOffersPerConversation: 2,
  maxOffersPerDay: 30,
  fallbackToMessage: true,
  pollIntervalSeconds: 60,
}

export const DEFAULT_TEMPLATES: MessageTemplates = {
  fallback: "Hi! Thanks for your interest 😊 I'm open to reasonable offers — feel free to make one!",
  greeting: '',
}

export const DEFAULT_LIKE_MESSAGES: LikeMessageSettings = {
  enabled: false,
  template: 'Hi @buyer_name! Thanks for liking "@item_name" 😊 It\'s still available at @item_price. Feel free to make an offer!',
}

export const DEFAULT_ACCEPTED_OFFER_MESSAGE: AcceptedOfferMessageSettings = {
  enabled: false,
  template: 'Hi @buyer_name! Thank you for your purchase of "@item_name" 🎉 I\'ll ship it out as soon as possible. Let me know if you have any questions!',
}

export const DEFAULT_LIKE_OFFER: LikeOfferSettings = {
  enabled: false,
  discountPercent: 10,
}

export const DEFAULT_RESTOCKER: RestockerSettings = {
  enabled: false,
  autoRepost: false,
  delayHours: 0,
}

export const DEFAULT_SMART_AGENT: SmartAgentSettings = {
  enabled: false,
  personalityPrompt: 'You are a friendly and professional seller on Vinted. Be concise, helpful, and polite. Respond in the same language as the buyer.',
  minPriceFloor: 0,
  dailyReplyLimit: 50,
  dryRun: false,
}

export const DEFAULT_SETTINGS: Settings = {
  offerRules: DEFAULT_OFFER_RULES,
  messageTemplates: DEFAULT_TEMPLATES,
  automationEnabled: false,
  anthropicApiKey: '',
  likeMessages: DEFAULT_LIKE_MESSAGES,
  acceptedOfferMessage: DEFAULT_ACCEPTED_OFFER_MESSAGE,
  likeOffer: DEFAULT_LIKE_OFFER,
  restocker: DEFAULT_RESTOCKER,
  smartAgent: DEFAULT_SMART_AGENT,
}

// ─── sync tier — settings ─────────────────────────────────────────────────────

export const syncStorage = {
  async getSettings(): Promise<Settings> {
    const data = await chrome.storage.sync.get('settings') as Record<string, unknown>
    return (data['settings'] as Settings) ?? DEFAULT_SETTINGS
  },

  async saveSettings(settings: Settings): Promise<void> {
    await chrome.storage.sync.set({ settings })
  },

  async getEnabled(): Promise<boolean> {
    const s = await syncStorage.getSettings()
    return s.automationEnabled
  },

  async setEnabled(enabled: boolean): Promise<void> {
    const s = await syncStorage.getSettings()
    await syncStorage.saveSettings({ ...s, automationEnabled: enabled })
  },

  async getApiKey(): Promise<string> {
    const s = await syncStorage.getSettings()
    return s.anthropicApiKey ?? ''
  },

  async setApiKey(key: string): Promise<void> {
    const s = await syncStorage.getSettings()
    await syncStorage.saveSettings({ ...s, anthropicApiKey: key })
  },
}

// ─── local tier — history & notes ────────────────────────────────────────────

export const localStore = {
  async getOfferLog(): Promise<OfferLogEntry[]> {
    const data = await chrome.storage.local.get('offerLog') as Record<string, unknown>
    return (data['offerLog'] as OfferLogEntry[]) ?? []
  },

  async appendOffer(entry: OfferLogEntry): Promise<void> {
    const log = await localStore.getOfferLog()
    // Keep last 500 entries
    const trimmed = [...log, entry].slice(-500)
    await chrome.storage.local.set({ offerLog: trimmed })
  },

  async getMessageLog(): Promise<MessageLogEntry[]> {
    const data = await chrome.storage.local.get('messageLog') as Record<string, unknown>
    return (data['messageLog'] as MessageLogEntry[]) ?? []
  },

  async appendMessage(entry: MessageLogEntry): Promise<void> {
    const log = await localStore.getMessageLog()
    const trimmed = [...log, entry].slice(-500)
    await chrome.storage.local.set({ messageLog: trimmed })
  },

  async getNote(conversationId: string): Promise<InboxNote | null> {
    const data = await chrome.storage.local.get('inboxNotes') as Record<string, unknown>
    const notes = (data['inboxNotes'] as Record<string, InboxNote>) ?? {}
    return notes[conversationId] ?? null
  },

  async saveNote(note: InboxNote): Promise<void> {
    const data = await chrome.storage.local.get('inboxNotes') as Record<string, unknown>
    const notes = (data['inboxNotes'] as Record<string, InboxNote>) ?? {}
    notes[note.conversationId] = note
    await chrome.storage.local.set({ inboxNotes: notes })
  },

  // ── Like message / offer throttle tracking ────────────────────────────────

  async getLikeSentAt(userId: string, type: 'message' | 'offer'): Promise<number> {
    const key = type === 'message' ? 'likeMessagesSent' : 'likeOffersSent'
    const data = await chrome.storage.local.get(key) as Record<string, unknown>
    const map = (data[key] as Record<string, number>) ?? {}
    return map[userId] ?? 0
  },

  async markLikeSent(userId: string, type: 'message' | 'offer'): Promise<void> {
    const key = type === 'message' ? 'likeMessagesSent' : 'likeOffersSent'
    const data = await chrome.storage.local.get(key) as Record<string, unknown>
    const map = (data[key] as Record<string, number>) ?? {}
    map[userId] = Date.now()
    // Prune entries older than 7 days to keep storage lean
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    for (const [k, ts] of Object.entries(map)) {
      if (ts < cutoff) delete map[k]
    }
    await chrome.storage.local.set({ [key]: map })
  },

  // ── Accepted-offer message dedup ───────────────────────────────────────────

  async isAcceptedMessageSent(conversationId: string): Promise<boolean> {
    const data = await chrome.storage.local.get('acceptedMsgSent') as Record<string, unknown>
    const set = (data['acceptedMsgSent'] as Record<string, boolean>) ?? {}
    return set[conversationId] ?? false
  },

  async markAcceptedMessageSent(conversationId: string): Promise<void> {
    const data = await chrome.storage.local.get('acceptedMsgSent') as Record<string, unknown>
    const set = (data['acceptedMsgSent'] as Record<string, boolean>) ?? {}
    set[conversationId] = true
    await chrome.storage.local.set({ acceptedMsgSent: set })
  },

  // ── Processed notification IDs (prevents re-processing on each poll) ───────

  async getProcessedNotificationIds(): Promise<Set<string>> {
    const data = await chrome.storage.local.get('processedNotifIds') as Record<string, unknown>
    const arr = (data['processedNotifIds'] as string[]) ?? []
    return new Set(arr)
  },

  async markNotificationsProcessed(ids: string[]): Promise<void> {
    const existing = await localStore.getProcessedNotificationIds()
    const merged = [...existing, ...ids]
    // Keep last 500 IDs to bound storage usage
    const trimmed = merged.slice(-500)
    await chrome.storage.local.set({ processedNotifIds: trimmed })
  },

  // ── Restocker: sold item tracking ─────────────────────────────────────────

  async getSoldItems(): Promise<SoldItemEntry[]> {
    const data = await chrome.storage.local.get('soldItems') as Record<string, unknown>
    return (data['soldItems'] as SoldItemEntry[]) ?? []
  },

  async upsertSoldItem(entry: SoldItemEntry): Promise<void> {
    const items = await localStore.getSoldItems()
    const idx = items.findIndex(i => i.id === entry.id)
    if (idx >= 0) {
      items[idx] = { ...items[idx], ...entry }
    } else {
      items.push(entry)
    }
    // Keep last 200 entries
    const trimmed = items.slice(-200)
    await chrome.storage.local.set({ soldItems: trimmed })
  },

  async markSoldItemReposted(itemId: string, newItemId?: string): Promise<void> {
    const items = await localStore.getSoldItems()
    const entry = items.find(i => i.id === itemId)
    if (entry) {
      entry.repostedAt = Date.now()
      if (newItemId) entry.repostItemId = newItemId
      await chrome.storage.local.set({ soldItems: items })
    }
  },

  // ── Smart Agent: opted-out conversations ──────────────────────────────────

  async isSmartAgentOptedOut(conversationId: string): Promise<boolean> {
    const data = await chrome.storage.local.get('smartAgentOptOut') as Record<string, unknown>
    const map = (data['smartAgentOptOut'] as Record<string, boolean>) ?? {}
    return map[conversationId] ?? false
  },

  async setSmartAgentOptOut(conversationId: string, optOut: boolean): Promise<void> {
    const data = await chrome.storage.local.get('smartAgentOptOut') as Record<string, unknown>
    const map = (data['smartAgentOptOut'] as Record<string, boolean>) ?? {}
    if (optOut) {
      map[conversationId] = true
    } else {
      delete map[conversationId]
    }
    await chrome.storage.local.set({ smartAgentOptOut: map })
  },

  async getTodayStats(): Promise<{ offers: number; accepted: number; messages: number }> {
    const todayStart = new Date().setHours(0, 0, 0, 0)
    const [offerLog, msgLog] = await Promise.all([
      localStore.getOfferLog(),
      localStore.getMessageLog(),
    ])
    const todayOffers = offerLog.filter(e => e.sentAt >= todayStart)
    return {
      offers: todayOffers.filter(e => e.action === 'countered').length,
      accepted: todayOffers.filter(e => e.action === 'accepted').length,
      messages: msgLog.filter(e => e.sentAt >= todayStart).length,
    }
  },
}

// ─── session tier — live runtime state ───────────────────────────────────────

export const sessionStore = {
  async getConversationState(conversationId: string): Promise<ConversationState> {
    const data = await chrome.storage.session.get('convState') as Record<string, unknown>
    const all = (data['convState'] as Record<string, ConversationState>) ?? {}
    return all[conversationId] ?? {
      offersSentToday: 0,
      offersSentToConversation: 0,
      lastActionAt: 0,
    }
  },

  async updateConversationState(conversationId: string, patch: Partial<ConversationState>): Promise<void> {
    const data = await chrome.storage.session.get('convState') as Record<string, unknown>
    const all = (data['convState'] as Record<string, ConversationState>) ?? {}
    all[conversationId] = {
      ...(all[conversationId] ?? { offersSentToday: 0, offersSentToConversation: 0, lastActionAt: 0 }),
      ...patch,
    }
    await chrome.storage.session.set({ convState: all })
  },

  async getTotalOffersSentToday(): Promise<number> {
    const data = await chrome.storage.session.get('convState') as Record<string, unknown>
    const all = (data['convState'] as Record<string, ConversationState>) ?? {}
    return Object.values(all).reduce((sum, s) => sum + s.offersSentToday, 0)
  },

  async isRunning(): Promise<boolean> {
    const data = await chrome.storage.session.get('automationRunning') as Record<string, unknown>
    return (data['automationRunning'] as boolean) ?? false
  },

  async setRunning(value: boolean): Promise<void> {
    await chrome.storage.session.set({ automationRunning: value })
  },

  async getLastPollAt(): Promise<number | null> {
    const data = await chrome.storage.session.get('lastPollAt') as Record<string, unknown>
    return (data['lastPollAt'] as number) ?? null
  },

  async setLastPollAt(ts: number): Promise<void> {
    await chrome.storage.session.set({ lastPollAt: ts })
  },
}

// ─── Combined live stats for dashboard ───────────────────────────────────────

export async function getLiveStats(): Promise<AutoStats> {
  const [today, running, lastPollAt] = await Promise.all([
    localStore.getTodayStats(),
    sessionStore.isRunning(),
    sessionStore.getLastPollAt(),
  ])
  return {
    offersSentToday: today.offers,
    acceptedToday: today.accepted,
    messagesSentToday: today.messages,
    lastPollAt,
    running,
  }
}
