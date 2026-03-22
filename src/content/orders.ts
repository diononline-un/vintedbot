/**
 * ─── Orders ───────────────────────────────────────────────────────────────────
 *
 * P3-01: Fetch orders, merge shipping labels into one PDF
 * P3-02: Bulk leave feedback
 * P3-03: Extend shipping deadlines
 *
 * These functions are called directly from panel message handlers
 * (not from the poll loop — user-initiated).
 */

import { PDFDocument } from 'pdf-lib'
import { getOrders, getShipmentLabelUrl, leaveFeedback, sendMessage, throttledCall } from './vinted-api'
import { getCurrentUserId } from './vinted-api'
import type { VintedOrder } from '@/lib/types'

// ─── P3-01: Fetch orders ──────────────────────────────────────────────────────

export async function fetchOrders(): Promise<VintedOrder[]> {
  const userId = getCurrentUserId()
  if (!userId) return []
  return throttledCall(() => getOrders(userId))
}

// ─── P3-01: Download + merge shipping labels as one PDF ───────────────────────

export async function downloadMergedLabels(orders: VintedOrder[]): Promise<void> {
  const ordersWithShipment = orders.filter(o => o.shipmentId)
  if (ordersWithShipment.length === 0) {
    console.warn('[VintedAuto] No orders with shipment IDs')
    return
  }

  // Cap at 25 per merge run (dotZ limit)
  const batch = ordersWithShipment.slice(0, 25)
  const merged = await PDFDocument.create()

  for (const order of batch) {
    let labelUrl = order.labelUrl

    // If we don't have the URL cached, fetch it
    if (!labelUrl && order.shipmentId) {
      labelUrl = await throttledCall(() => getShipmentLabelUrl(order.shipmentId!)) ?? undefined
    }

    if (!labelUrl) continue

    try {
      const res = await fetch(labelUrl)
      if (!res.ok) continue
      const arrayBuffer = await res.arrayBuffer()
      const pdf = await PDFDocument.load(arrayBuffer)
      const pages = await merged.copyPages(pdf, pdf.getPageIndices())
      pages.forEach(p => merged.addPage(p))
    } catch (err) {
      console.warn('[VintedAuto] Label fetch error for order', order.id, err)
    }
  }

  const pdfBytes = await merged.save()
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)

  await chrome.downloads.download({
    url,
    filename: `vinted-labels-${new Date().toISOString().slice(0, 10)}.pdf`,
    saveAs: true,
  })

  // Clean up blob URL after download starts
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// ─── P3-02: Bulk leave feedback ───────────────────────────────────────────────

export async function bulkLeaveFeedback(
  orders: VintedOrder[],
  template: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ done: number; errors: number }> {
  const pending = orders.filter(o => !o.feedbackLeft && o.status === 'completed')
  let done = 0; let errors = 0

  for (const order of pending) {
    await new Promise(r => setTimeout(r, 800))  // rate limit
    const comment = template
      .replace('@buyer_name', order.buyerLogin)
      .replace('@item_name', order.itemTitle)
    const ok = await throttledCall(() =>
      leaveFeedback(order.id, 'positive', comment)
    )
    if (ok) done++
    else errors++
    onProgress?.(done + errors, pending.length)
  }

  return { done, errors }
}

// ─── P3-03: Extend shipping deadline ─────────────────────────────────────────
//
// Vinted doesn't have a public API for deadline extensions.
// Best-effort: send a message to the buyer with the configured template
// and note internally that an extension was requested.

export async function requestDeadlineExtension(
  order: VintedOrder,
  messageTemplate: string,
  threadId: string,
): Promise<boolean> {
  const text = messageTemplate
    .replace('@buyer_name', order.buyerLogin)
    .replace('@item_name', order.itemTitle)
  return throttledCall(() => sendMessage(threadId, text))
}
