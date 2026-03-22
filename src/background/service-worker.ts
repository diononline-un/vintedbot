/**
 * ─── Service Worker — Tab Watchdog ────────────────────────────────────────────
 *
 * Keeps one pinned Vinted tab alive. That's it.
 * All automation logic runs in the content script.
 */

const VINTED_ORIGINS = [
  'https://www.vinted.at', 'https://www.vinted.be', 'https://www.vinted.co.uk',
  'https://www.vinted.com', 'https://www.vinted.cz', 'https://www.vinted.de',
  'https://www.vinted.dk', 'https://www.vinted.es', 'https://www.vinted.fi',
  'https://www.vinted.fr', 'https://www.vinted.gr', 'https://www.vinted.hr',
  'https://www.vinted.hu', 'https://www.vinted.ie', 'https://www.vinted.it',
  'https://www.vinted.lt', 'https://www.vinted.lu', 'https://www.vinted.nl',
  'https://www.vinted.pl', 'https://www.vinted.pt', 'https://www.vinted.ro',
  'https://www.vinted.se', 'https://www.vinted.sk',
]

// ─── On install: open a pinned Vinted tab ─────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await ensureVintedTab()
  }
})

// ─── Watchdog alarm: check every 5 minutes ────────────────────────────────────

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('watchdog', { periodInMinutes: 5 })
})

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'watchdog') await ensureVintedTab()
})

// Also create alarm right away in case SW just woke up
chrome.alarms.create('watchdog', { periodInMinutes: 5 })

// ─── ensureVintedTab ──────────────────────────────────────────────────────────

async function ensureVintedTab(): Promise<void> {
  const allTabs = await chrome.tabs.query({})
  const vintedTab = allTabs.find(t =>
    t.url && VINTED_ORIGINS.some(o => t.url!.startsWith(o))
  )

  if (vintedTab?.id) {
    // Tab exists — make sure it's pinned and won't be discarded
    const updates: chrome.tabs.UpdateProperties = {}
    if (!vintedTab.pinned) updates.pinned = true
    if (vintedTab.autoDiscardable !== false) updates.autoDiscardable = false
    if (Object.keys(updates).length > 0) {
      await chrome.tabs.update(vintedTab.id, updates)
    }
    return
  }

  // No Vinted tab found — open one
  await chrome.tabs.create({
    url: 'https://www.vinted.de',
    pinned: true,
    active: false,
  })
}

// ─── Side panel: open on extension icon click ─────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id! })
})

// ─── Message forwarding: panel → content script ───────────────────────────────
// For actions that require the content script (same-origin fetch), the panel
// sends a message here and we forward it to the active Vinted tab.

// Messages forwarded to the Vinted content script:
const FORWARDED_MESSAGES = new Set([
  'REPOST_ITEM', 'GET_UNREAD_THREAD_IDS', 'MARK_THREAD_READ', 'BULK_CATALOG_OP',
  'FETCH_ORDERS', 'DOWNLOAD_LABELS', 'BULK_FEEDBACK', 'REQUEST_DEADLINE_EXTENSION',
  'EXPORT_CATALOG', 'EXPORT_TRANSACTIONS', 'APPLY_PHOTO_FILTERS', 'RESTORE_ORIGINAL_PHOTOS',
])

// Handle catalog toolbar action: store selection and open panel
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'OPEN_PANEL_CATALOG') {
    // Persist selection so the panel can read it on open
    chrome.storage.session.set({
      catalogPendingAction: { action: msg.action, itemIds: msg.itemIds }
    }).then(async () => {
      // Open side panel on the tab that sent the message
      if (_sender.tab?.id) {
        await chrome.sidePanel.open({ tabId: _sender.tab.id })
      }
      sendResponse({ ok: true })
    })
    return true
  }
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (FORWARDED_MESSAGES.has(msg.type)) {
    chrome.tabs.query({}).then(async tabs => {
      const vintedTab = tabs.find(t =>
        t.url && VINTED_ORIGINS.some(o => t.url!.startsWith(o))
      )
      if (!vintedTab?.id) {
        sendResponse({ ok: false, error: 'No Vinted tab found' })
        return
      }
      try {
        const response = await chrome.tabs.sendMessage(vintedTab.id, msg)
        sendResponse(response)
      } catch (err) {
        sendResponse({ ok: false, error: String(err) })
      }
    })
    return true  // keep channel open
  }
})
