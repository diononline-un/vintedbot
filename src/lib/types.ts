// ─── Core domain types ────────────────────────────────────────────────────────

export interface OfferRules {
  enabled: boolean
  counterAtPercent: number        // e.g. 85 → counter at 85% of listing price
  autoAcceptAbovePercent: number  // e.g. 92 → accept immediately if offer >= 92%
  maxOffersPerConversation: number
  maxOffersPerDay: number
  fallbackToMessage: boolean      // send message when offer limit hit
  pollIntervalSeconds: number
}

export interface MessageTemplates {
  fallback: string   // sent when offer limit is hit
  greeting: string   // sent on first contact (optional)
}

export interface LikeMessageSettings {
  enabled: boolean
  template: string   // variables: @buyer_name, @item_name, @item_price
}

export interface AcceptedOfferMessageSettings {
  enabled: boolean
  template: string   // variables: @buyer_name, @item_name, @sale_price
}

export interface LikeOfferSettings {
  enabled: boolean
  discountPercent: number  // e.g. 10 → send offer at 90% of listing price
}

export interface RestockerSettings {
  enabled: boolean
  autoRepost: boolean      // if true, repost automatically after delayHours
  delayHours: number       // hours to wait before auto-repost (0 = immediate)
}

export interface SmartAgentSettings {
  enabled: boolean
  personalityPrompt: string   // system prompt snippet describing seller personality
  minPriceFloor: number       // never agree to a price below this (0 = disabled)
  dailyReplyLimit: number     // max auto-replies per day, default 50
  dryRun: boolean             // log but don't actually send
}

export interface Settings {
  offerRules: OfferRules
  messageTemplates: MessageTemplates
  automationEnabled: boolean
  anthropicApiKey: string
  likeMessages: LikeMessageSettings
  acceptedOfferMessage: AcceptedOfferMessageSettings
  likeOffer: LikeOfferSettings
  restocker: RestockerSettings
  smartAgent: SmartAgentSettings
}

// ─── Vinted order/transaction ─────────────────────────────────────────────────

export interface VintedOrder {
  id: string
  itemId: string
  itemTitle: string
  buyerLogin: string
  salePrice: number
  currency: string
  status: string           // e.g. 'shipped', 'completed', 'awaiting_shipment'
  shipmentId?: string
  labelUrl?: string        // direct URL to shipping label PDF
  shippingDeadlineAt?: number  // Unix ms
  feedbackLeft: boolean
  createdAt: number
}

// ─── Thread message (from /api/v2/threads/{id}/messages) ─────────────────────

export interface VintedThreadMessage {
  id: string
  body: string
  senderId: string    // user ID of sender
  createdAt: number
}

// ─── Vinted item (from /api/v2/users/{id}/items) ──────────────────────────────

export interface VintedItem {
  id: string
  title: string
  price: number
  currency: string
  status: 'active' | 'sold_out' | 'hidden' | string
  thumbnailUrl: string
  url: string
  soldAt?: number   // derived from when we first detected it as sold
}

// ─── Sold item entry (storage.local) ─────────────────────────────────────────

export interface SoldItemEntry {
  id: string               // Vinted item ID
  title: string
  price: number
  currency: string
  thumbnailUrl: string
  soldAt: number           // Unix ms when we first detected it sold
  repostedAt?: number      // Unix ms when it was reposted (undefined = not yet)
  repostItemId?: string    // new item ID after repost
}

// ─── Vinted notification (from /api/v2/users/{id}/notifications) ──────────────

export interface VintedNotification {
  id: string
  type: string          // e.g. 'new_item_liked'
  notifierId: string    // user ID who triggered the event
  notifierLogin: string // username
  itemId: string
  itemTitle: string
  itemPrice: number
  currency: string
  createdAt: number
}

// ─── Offer log entry (storage.local) ─────────────────────────────────────────

export interface OfferLogEntry {
  id: string
  conversationId: string
  itemId: string
  itemTitle: string
  listingPrice: number
  offerAmount: number
  counterAmount?: number
  action: 'accepted' | 'countered' | 'skipped' | 'limit_hit'
  sentAt: number  // Unix ms
}

// ─── Message log entry (storage.local) ───────────────────────────────────────

export interface MessageLogEntry {
  id: string
  conversationId: string
  message: string
  reason: 'fallback' | 'greeting'
  sentAt: number
}

// ─── Inbox note (storage.local) ──────────────────────────────────────────────

export interface InboxNote {
  conversationId: string
  text: string
  updatedAt: number
}

// ─── Live conversation state (storage.session) ───────────────────────────────

export interface ConversationState {
  offersSentToday: number
  offersSentToConversation: number
  lastActionAt: number
  lastMessageAt?: number
}

// ─── Automation stats for dashboard ──────────────────────────────────────────

export interface AutoStats {
  offersSentToday: number
  acceptedToday: number
  messagesSentToday: number
  lastPollAt: number | null
  running: boolean
}

// ─── Vinted API shapes ────────────────────────────────────────────────────────

export interface VintedOffer {
  id: string
  conversationId: string
  itemId: string
  itemTitle: string
  listingPrice: number   // seller's current price
  offerPrice: number     // buyer's offered price
  currency: string
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  createdAt: number
}

export interface VintedConversation {
  id: string
  itemId: string
  itemTitle: string
  listingPrice: number
  buyerUserId: string
  lastMessageAt: number
  hasUnreadOffer: boolean
  latestOffer?: VintedOffer
}
