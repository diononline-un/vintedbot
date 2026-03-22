/**
 * ─── Vinted API Layer ─────────────────────────────────────────────────────────
 *
 * Calls Vinted's own internal API directly from the content script.
 * We have the user's session cookies automatically (same-origin injection).
 *
 * API endpoints reverse-engineered from the original extension's network calls.
 * All paths hit the current page's origin (e.g. https://www.vinted.de).
 */

import type { VintedConversation, VintedOffer, VintedNotification, VintedItem, VintedThreadMessage, VintedOrder } from '@/lib/types'

const BASE = window.location.origin  // e.g. https://www.vinted.de

// ─── CSRF token (required for POST/PUT) ──────────────────────────────────────

function getCsrfToken(): string {
  // Vinted stores the CSRF token in a meta tag and in cookies
  const meta = document.querySelector('meta[name="csrf-token"]')
  if (meta) return meta.getAttribute('content') ?? ''
  const match = document.cookie.match(/(?:^|;\s*)_vinted_fr_session=[^;]+/)
  return match ? '' : ''
}

// ─── Base fetch wrapper ───────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-CSRF-Token': getCsrfToken(),
      'X-Requested-With': 'XMLHttpRequest',
      ...options.headers,
    },
    ...options,
  })

  if (res.status === 429) throw new Error('RATE_LIMITED')
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) throw new Error(`HTTP_${res.status}`)

  return res.json()
}

// ─── Get current user ID from page ───────────────────────────────────────────

export function getCurrentUserId(): string | null {
  const scripts = document.querySelectorAll('script')
  const pattern = /"userId"\s*:\s*"?(\d+)"?/
  for (const script of scripts) {
    const match = script.textContent?.match(pattern)
    if (match && match[1] !== 'undefined') return match[1]
  }
  // Fallback: try window.__INITIAL_STATE__
  try {
    const state = (window as any).__INITIAL_STATE__
    return state?.currentUser?.id?.toString() ?? null
  } catch { return null }
}

// ─── Fetch inbox conversations with pending offers ────────────────────────────

export async function getConversationsWithOffers(): Promise<VintedConversation[]> {
  try {
    const data = await apiFetch<any>('/api/v2/inbox?filter=unread&per_page=30')
    const threads = data?.threads ?? []

    return threads
      .filter((t: any) => t.last_offer && t.last_offer.status === 'pending_buyer')
      .map((t: any): VintedConversation => ({
        id: String(t.id),
        itemId: String(t.item?.id ?? ''),
        itemTitle: t.item?.title ?? '',
        listingPrice: parseFloat(t.item?.price ?? '0'),
        buyerUserId: String(t.opposing_user?.id ?? ''),
        lastMessageAt: new Date(t.last_message_date).getTime(),
        hasUnreadOffer: true,
        latestOffer: t.last_offer ? mapOffer(t.last_offer, String(t.id), t.item) : undefined,
      }))
  } catch (err) {
    console.warn('[VintedAuto] getConversationsWithOffers error:', err)
    return []
  }
}

function mapOffer(raw: any, conversationId: string, item: any): VintedOffer {
  return {
    id: String(raw.id),
    conversationId,
    itemId: String(item?.id ?? ''),
    itemTitle: item?.title ?? '',
    listingPrice: parseFloat(item?.price ?? '0'),
    offerPrice: parseFloat(raw.price ?? '0'),
    currency: raw.currency ?? 'EUR',
    status: raw.status === 'pending_buyer' ? 'pending' : raw.status,
    createdAt: new Date(raw.created_at).getTime(),
  }
}

// ─── Send a counter-offer ─────────────────────────────────────────────────────

export async function sendCounterOffer(
  conversationId: string,
  offerId: string,
  counterPrice: number,
  currency = 'EUR',
): Promise<boolean> {
  try {
    await apiFetch(`/api/v2/transactions/${offerId}/counter_offer`, {
      method: 'POST',
      body: JSON.stringify({
        counter_offer: {
          price: counterPrice.toFixed(2),
          currency,
        },
      }),
    })
    return true
  } catch (err) {
    console.warn('[VintedAuto] sendCounterOffer error:', err)
    return false
  }
}

// ─── Accept an offer ──────────────────────────────────────────────────────────

export async function acceptOffer(offerId: string): Promise<boolean> {
  try {
    await apiFetch(`/api/v2/transactions/${offerId}/accept`, {
      method: 'POST',
    })
    return true
  } catch (err) {
    console.warn('[VintedAuto] acceptOffer error:', err)
    return false
  }
}

// ─── Send a message ───────────────────────────────────────────────────────────

export async function sendMessage(
  conversationId: string,
  text: string,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  try {
    await apiFetch(`/api/v2/threads/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message: { body: text } }),
    })
    return true
  } catch (err) {
    console.warn('[VintedAuto] sendMessage error:', err)
    return false
  }
}

// ─── Fetch recent notifications (likes, sold items, etc.) ────────────────────
//
// Endpoint: GET /api/v2/users/{userId}/notifications?per_page=30
// Returns activities like 'new_item_liked', 'new_transaction', etc.

export async function getNotifications(userId: string): Promise<VintedNotification[]> {
  try {
    const data = await apiFetch<any>(
      `/api/v2/users/${userId}/notifications?per_page=30`
    )
    const notifications = data?.notifications ?? data?.activities ?? []
    return notifications.map((n: any): VintedNotification => ({
      id: String(n.id),
      type: n.type ?? n.notification_type ?? '',
      notifierId: String(n.notifier_id ?? n.user?.id ?? ''),
      notifierLogin: n.notifier_login ?? n.user?.login ?? '',
      itemId: String(n.item?.id ?? n.item_id ?? ''),
      itemTitle: n.item?.title ?? '',
      itemPrice: parseFloat(n.item?.price ?? '0'),
      currency: n.item?.currency ?? 'EUR',
      createdAt: new Date(n.created_at ?? n.date ?? 0).getTime(),
    }))
  } catch (err) {
    console.warn('[VintedAuto] getNotifications error:', err)
    return []
  }
}

// ─── Create or find a conversation thread about an item with a user ───────────
//
// Returns the thread/conversation ID, or null on failure.
// Vinted will return the existing thread if one already exists for this item+user pair.

export async function getOrCreateThread(
  itemId: string,
  receiverUserId: string,
  initialMessage: string,
): Promise<string | null> {
  try {
    const data = await apiFetch<any>('/api/v2/threads', {
      method: 'POST',
      body: JSON.stringify({
        thread: {
          message: { body: initialMessage },
          receiver_id: Number(receiverUserId),
          item_id: Number(itemId),
        },
      }),
    })
    const threadId = data?.thread?.id ?? data?.id
    return threadId ? String(threadId) : null
  } catch (err) {
    console.warn('[VintedAuto] getOrCreateThread error:', err)
    return null
  }
}

// ─── Send a private offer to a specific user for an item ─────────────────────
//
// Used for the "Like → Auto Discount Offer" feature (P1-03).
// Price should already be rounded appropriately before calling.

export async function sendPrivateOffer(
  itemId: string,
  buyerUserId: string,
  price: number,
  currency = 'EUR',
): Promise<boolean> {
  try {
    await apiFetch(`/api/v2/items/${itemId}/offers`, {
      method: 'POST',
      body: JSON.stringify({
        offer: {
          price: price.toFixed(2),
          currency,
          user_id: Number(buyerUserId),
        },
      }),
    })
    return true
  } catch (err) {
    console.warn('[VintedAuto] sendPrivateOffer error:', err)
    return false
  }
}

// ─── Get recent messages in a thread ─────────────────────────────────────────
//
// Used by Smart Agent to build conversation context.

export async function getThreadMessages(
  threadId: string,
  perPage = 5,
): Promise<VintedThreadMessage[]> {
  try {
    const data = await apiFetch<any>(
      `/api/v2/threads/${threadId}/messages?per_page=${perPage}`
    )
    const messages: any[] = data?.messages ?? []
    return messages.map((m: any): VintedThreadMessage => ({
      id: String(m.id),
      body: m.body ?? m.message ?? '',
      senderId: String(m.user_id ?? m.sender_id ?? ''),
      createdAt: new Date(m.created_at ?? 0).getTime(),
    })).sort((a, b) => a.createdAt - b.createdAt)  // oldest first
  } catch (err) {
    console.warn('[VintedAuto] getThreadMessages error:', err)
    return []
  }
}

// ─── Mark a thread as read ────────────────────────────────────────────────────

export async function markThreadRead(threadId: string): Promise<boolean> {
  try {
    await apiFetch(`/api/v2/threads/${threadId}`, {
      method: 'PUT',
      body: JSON.stringify({ mark_as_read: true }),
    })
    return true
  } catch (err) {
    console.warn('[VintedAuto] markThreadRead error:', err)
    return false
  }
}

// ─── Get unread thread IDs ────────────────────────────────────────────────────

export async function getUnreadThreadIds(userId: string): Promise<string[]> {
  try {
    const data = await apiFetch<any>(
      `/api/v2/users/${userId}/threads?has_unread=true&per_page=50`
    )
    const threads: any[] = data?.threads ?? []
    return threads.map((t: any) => String(t.id))
  } catch (err) {
    console.warn('[VintedAuto] getUnreadThreadIds error:', err)
    return []
  }
}

// ─── Fetch a user's items (by status) ────────────────────────────────────────
//
// status: 'active' | 'sold_out' | 'hidden' etc.
// Used by the Restocker to detect newly sold items.

export async function getUserItems(
  userId: string,
  status = 'sold_out',
  perPage = 30,
): Promise<VintedItem[]> {
  try {
    const data = await apiFetch<any>(
      `/api/v2/users/${userId}/items?page=1&per_page=${perPage}&order=newest_first&status[]=${status}`
    )
    const items: any[] = data?.items ?? []
    return items.map((i: any): VintedItem => ({
      id: String(i.id),
      title: i.title ?? '',
      price: parseFloat(i.price ?? '0'),
      currency: i.currency ?? 'EUR',
      status: i.status ?? status,
      thumbnailUrl: i.photos?.[0]?.url ?? i.photo?.url ?? '',
      url: i.url ?? '',
    }))
  } catch (err) {
    console.warn('[VintedAuto] getUserItems error:', err)
    return []
  }
}

// ─── Repost a sold item (recreate listing) ────────────────────────────────────
//
// Attempts POST /api/v2/items/{itemId}/repost — Vinted's internal repost
// endpoint that recreates a sold listing with the same data.
// Returns the new item ID on success, null on failure.

export async function repostItem(itemId: string): Promise<string | null> {
  try {
    const data = await apiFetch<any>(`/api/v2/items/${itemId}/repost`, {
      method: 'POST',
    })
    // Response may contain the new item under data.item.id or data.id
    const newId = data?.item?.id ?? data?.id
    return newId ? String(newId) : 'ok'  // 'ok' signals success even without new ID
  } catch (err) {
    console.warn('[VintedAuto] repostItem error:', err)
    return null
  }
}

// ─── Get seller transactions (orders) ────────────────────────────────────────

export async function getOrders(
  userId: string,
  perPage = 30,
): Promise<VintedOrder[]> {
  try {
    const data = await apiFetch<any>(
      `/api/v2/users/${userId}/transactions?as=seller&per_page=${perPage}&order=newest_first`
    )
    const transactions: any[] = data?.transactions ?? []
    return transactions.map((t: any): VintedOrder => ({
      id: String(t.id),
      itemId: String(t.item?.id ?? t.item_id ?? ''),
      itemTitle: t.item?.title ?? '',
      buyerLogin: t.buyer?.login ?? '',
      salePrice: parseFloat(t.price ?? t.item?.price ?? '0'),
      currency: t.currency ?? 'EUR',
      status: t.status ?? '',
      shipmentId: t.shipment_id ? String(t.shipment_id) : undefined,
      labelUrl: t.label_url ?? undefined,
      shippingDeadlineAt: t.shipping_deadline_at
        ? new Date(t.shipping_deadline_at).getTime()
        : undefined,
      feedbackLeft: t.feedback?.left === true,
      createdAt: new Date(t.created_at ?? 0).getTime(),
    }))
  } catch (err) {
    console.warn('[VintedAuto] getOrders error:', err)
    return []
  }
}

// ─── Get shipping label PDF URL ───────────────────────────────────────────────

export async function getShipmentLabelUrl(shipmentId: string): Promise<string | null> {
  try {
    const data = await apiFetch<any>(`/api/v2/shipments/${shipmentId}/label`)
    return data?.url ?? data?.label_url ?? null
  } catch (err) {
    console.warn('[VintedAuto] getShipmentLabelUrl error:', err)
    return null
  }
}

// ─── Submit seller feedback ───────────────────────────────────────────────────

export async function leaveFeedback(
  transactionId: string,
  feedback: 'positive' | 'neutral' | 'negative',
  comment: string,
): Promise<boolean> {
  try {
    await apiFetch(`/api/v2/feedbacks`, {
      method: 'POST',
      body: JSON.stringify({
        feedback: {
          transaction_id: Number(transactionId),
          rating: feedback,
          body: comment,
        },
      }),
    })
    return true
  } catch (err) {
    console.warn('[VintedAuto] leaveFeedback error:', err)
    return false
  }
}

// ─── Paginated item fetch (for export) ───────────────────────────────────────

export async function getAllUserItems(
  userId: string,
  statusFilter?: string,
): Promise<any[]> {
  const results: any[] = []
  let page = 1
  while (true) {
    try {
      const statusParam = statusFilter ? `&status[]=${statusFilter}` : ''
      const data = await apiFetch<any>(
        `/api/v2/users/${userId}/items?page=${page}&per_page=100&order=newest_first${statusParam}`
      )
      const items: any[] = data?.items ?? []
      results.push(...items)
      if (items.length < 100) break
      page++
    } catch {
      break
    }
  }
  return results
}

// ─── Get single item details ──────────────────────────────────────────────────

export async function getItem(itemId: string): Promise<any | null> {
  try {
    const data = await apiFetch<any>(`/api/v2/items/${itemId}`)
    return data?.item ?? data ?? null
  } catch (err) {
    console.warn('[VintedAuto] getItem error:', err)
    return null
  }
}

// ─── Update item (PATCH) ──────────────────────────────────────────────────────

export async function updateItem(
  itemId: string,
  patch: Record<string, any>,
): Promise<boolean> {
  try {
    await apiFetch(`/api/v2/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ item: patch }),
    })
    return true
  } catch (err) {
    console.warn('[VintedAuto] updateItem error:', err)
    return false
  }
}

// ─── Bump (repost) an active item ────────────────────────────────────────────

export async function bumpItem(itemId: string): Promise<boolean> {
  try {
    await apiFetch(`/api/v2/items/${itemId}/bump`, { method: 'POST' })
    return true
  } catch (err) {
    console.warn('[VintedAuto] bumpItem error:', err)
    return false
  }
}

// ─── Create a new item (duplicate) ───────────────────────────────────────────

export async function createItem(data: Record<string, any>): Promise<string | null> {
  try {
    const res = await apiFetch<any>('/api/v2/items', {
      method: 'POST',
      body: JSON.stringify({ item: data }),
    })
    const id = res?.item?.id ?? res?.id
    return id ? String(id) : null
  } catch (err) {
    console.warn('[VintedAuto] createItem error:', err)
    return null
  }
}

// ─── Throttle helper (min ms between calls) ───────────────────────────────────

let lastCallAt = 0
export async function throttledCall<T>(fn: () => Promise<T>, minGapMs = 1500): Promise<T> {
  const now = Date.now()
  const wait = Math.max(0, lastCallAt + minGapMs - now)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastCallAt = Date.now()
  return fn()
}
