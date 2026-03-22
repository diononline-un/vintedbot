/**
 * ─── Catalog Injection ─────────────────────────────────────────────────────────
 *
 * P2-01: Inject a sticky toolbar + per-item checkboxes on Vinted's catalog page.
 *
 * Target URL: /member/{userId}/items
 *
 * Toolbar actions (Reprice, Repost, Duplicate, Edit, Export) open the side panel
 * to the Catalog section with the selected item IDs pre-filled.
 *
 * Selection is stored on window.__vintedAutoSelection (Set<string>) so it
 * survives Vinted's React virtual list re-renders.
 */

// ─── Global selection state ───────────────────────────────────────────────────

declare global {
  interface Window {
    __vintedAutoSelection: Set<string>
    __vintedAutoCatalogInjected: boolean
  }
}

window.__vintedAutoSelection = window.__vintedAutoSelection ?? new Set()

// ─── Page detection ───────────────────────────────────────────────────────────

export function isCatalogPage(): boolean {
  return /\/member\/\d+\/items/.test(window.location.pathname)
}

// ─── Main injection entry point ───────────────────────────────────────────────

export function initCatalogInjection(): void {
  if (!isCatalogPage()) return

  injectOnce()

  // Re-inject on React re-renders (Vinted uses client-side routing)
  const observer = new MutationObserver(() => {
    if (!isCatalogPage()) return
    injectOnce()
    injectItemCheckboxes()
  })

  observer.observe(document.body, { childList: true, subtree: true })
}

// ─── Toolbar injection ────────────────────────────────────────────────────────

function injectOnce(): void {
  if (document.getElementById('vinted-auto-toolbar')) return

  const itemGrid = findItemGrid()
  if (!itemGrid) return

  const toolbar = buildToolbar()
  itemGrid.parentElement?.insertBefore(toolbar, itemGrid)
  window.__vintedAutoCatalogInjected = true
}

function findItemGrid(): Element | null {
  // Vinted renders items in a grid — look for common selectors
  const selectors = [
    '[data-testid="items-list"]',
    '.items-grid',
    '.u-flexbox.u-flex-wrap',
    '[class*="ItemBox"]',
  ]
  for (const sel of selectors) {
    const el = document.querySelector(sel)
    if (el) return el
  }
  // Fallback: find a container with multiple item cards
  const cards = document.querySelectorAll('[class*="item-box"], [class*="ItemBox"]')
  if (cards.length >= 2) return cards[0].parentElement
  return null
}

function buildToolbar(): HTMLElement {
  const bar = document.createElement('div')
  bar.id = 'vinted-auto-toolbar'
  bar.style.cssText = `
    position: sticky; top: 0; z-index: 1000;
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px; margin-bottom: 8px;
    background: #1a1a2e; border: 1px solid #2a2a4a;
    border-radius: 8px; font-family: system-ui, sans-serif;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  `

  // Select all checkbox
  const selectAll = document.createElement('input')
  selectAll.type = 'checkbox'
  selectAll.title = 'Select all'
  selectAll.style.cssText = 'cursor:pointer; width:14px; height:14px; flex-shrink:0;'
  selectAll.addEventListener('change', () => {
    const checkboxes = document.querySelectorAll<HTMLInputElement>('.vinted-auto-item-check')
    checkboxes.forEach(cb => {
      cb.checked = selectAll.checked
      const itemId = cb.dataset.itemId
      if (itemId) {
        if (selectAll.checked) window.__vintedAutoSelection.add(itemId)
        else window.__vintedAutoSelection.delete(itemId)
      }
    })
    updateToolbar(bar)
  })
  bar.appendChild(selectAll)

  // Count badge
  const badge = document.createElement('span')
  badge.id = 'vinted-auto-count'
  badge.style.cssText = 'font-size:11px; color:#94a3b8; flex-shrink:0; min-width:60px;'
  badge.textContent = '0 selected'
  bar.appendChild(badge)

  // Divider
  const divider = document.createElement('div')
  divider.style.cssText = 'flex:1;'
  bar.appendChild(divider)

  // Action buttons
  const actions: [string, string][] = [
    ['reprice',    '💰 Reprice'],
    ['repost',     '♻ Repost'],
    ['duplicate',  '📋 Duplicate'],
    ['edit',       '✏ Edit'],
  ]

  for (const [action, label] of actions) {
    const btn = createActionButton(label, action)
    bar.appendChild(btn)
  }

  return bar
}

function createActionButton(label: string, action: string): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.dataset.action = action
  btn.textContent = label
  btn.disabled = true
  btn.style.cssText = `
    padding: 5px 10px; border-radius: 6px; border: none;
    background: rgba(99,102,241,0.15); color: #6366f1;
    font-size: 11px; font-weight: 600; cursor: pointer;
    opacity: 0.4; transition: opacity 0.15s;
  `
  btn.addEventListener('click', () => {
    const ids = [...window.__vintedAutoSelection]
    if (ids.length === 0) return
    chrome.runtime.sendMessage({
      type: 'OPEN_PANEL_CATALOG',
      action,
      itemIds: ids,
    })
  })
  return btn
}

function updateToolbar(toolbar: HTMLElement): void {
  const count = window.__vintedAutoSelection.size
  const badge = toolbar.querySelector<HTMLElement>('#vinted-auto-count')
  if (badge) badge.textContent = `${count} selected`

  toolbar.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(btn => {
    btn.disabled = count === 0
    btn.style.opacity = count === 0 ? '0.4' : '1'
  })
}

// ─── Per-item checkbox injection ──────────────────────────────────────────────

function injectItemCheckboxes(): void {
  // Look for item cards that don't yet have our checkbox
  const cards = document.querySelectorAll<HTMLElement>(
    '[class*="item-box"]:not([data-va-checked]), [class*="ItemBox"]:not([data-va-checked]), [data-testid*="item"]:not([data-va-checked])'
  )

  cards.forEach(card => {
    const itemId = extractItemId(card)
    if (!itemId) return

    card.dataset.vaChecked = '1'
    card.style.position = 'relative'

    const wrapper = document.createElement('div')
    wrapper.style.cssText = `
      position: absolute; top: 6px; left: 6px; z-index: 10;
      opacity: 0; transition: opacity 0.15s;
    `

    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.className = 'vinted-auto-item-check'
    cb.dataset.itemId = itemId
    cb.checked = window.__vintedAutoSelection.has(itemId)
    cb.style.cssText = 'width:16px; height:16px; cursor:pointer; accent-color:#6366f1;'

    cb.addEventListener('change', () => {
      if (cb.checked) window.__vintedAutoSelection.add(itemId)
      else window.__vintedAutoSelection.delete(itemId)
      const toolbar = document.getElementById('vinted-auto-toolbar')
      if (toolbar) updateToolbar(toolbar)
    })

    wrapper.appendChild(cb)
    card.appendChild(wrapper)

    // Show checkbox on hover
    card.addEventListener('mouseenter', () => { wrapper.style.opacity = '1' })
    card.addEventListener('mouseleave', () => {
      if (!cb.checked) wrapper.style.opacity = '0'
    })
    if (cb.checked) wrapper.style.opacity = '1'
  })
}

function extractItemId(card: HTMLElement): string | null {
  // Try data attributes first
  const fromData = card.dataset.itemId ?? card.dataset.id
  if (fromData) return fromData

  // Try href in child anchor
  const anchor = card.querySelector<HTMLAnchorElement>('a[href*="/items/"]')
  if (anchor?.href) {
    const match = anchor.href.match(/\/items\/(\d+)/)
    if (match) return match[1]
  }

  return null
}
