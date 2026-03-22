/**
 * Catalog section — Restocker (P1-04) + Bulk Ops (P2-01..P2-05)
 */
import { useState, useEffect, useCallback } from 'preact/hooks'
import { syncStorage, localStore, DEFAULT_SETTINGS } from '@/storage'
import type { Settings, SoldItemEntry } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type BulkAction = 'reprice' | 'repost' | 'duplicate' | 'edit' | null

interface PendingAction {
  action: BulkAction
  itemIds: string[]
}

// ─── Root section ─────────────────────────────────────────────────────────────

export function Catalog() {
  const [sub, setSub] = useState<'restocker' | 'bulk'>('restocker')
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)

  // On mount, check if the service worker set a pending catalog action
  useEffect(() => {
    chrome.storage.session.get('catalogPendingAction').then((data: any) => {
      const pending = data?.catalogPendingAction
      if (pending?.action && pending?.itemIds?.length > 0) {
        setPendingAction(pending)
        setSub('bulk')
        chrome.storage.session.remove('catalogPendingAction')
      }
    })
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
      {/* Sub-nav */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px', flexShrink: 0 }}>
        {([
          ['restocker', '♻ Restocker'],
          ['bulk',      '⚙ Bulk Ops'],
        ] as ['restocker' | 'bulk', string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSub(id)}
            style={{
              padding: '5px 0', borderRadius: 'var(--radius-sm)', border: 'none',
              background: sub === id ? 'var(--surface-active)' : 'var(--surface)',
              color: sub === id ? 'var(--text)' : 'var(--text-muted)',
              fontWeight: sub === id ? 700 : 500, fontSize: '10px', cursor: 'pointer',
              transition: 'all 0.15s',
              ...(id === 'bulk' && pendingAction ? {
                background: 'var(--accent-dim)', color: 'var(--accent)',
              } : {}),
            }}
          >
            {label}{id === 'bulk' && pendingAction ? ` (${pendingAction.itemIds.length})` : ''}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sub === 'restocker' && <RestockerSection />}
        {sub === 'bulk' && (
          <BulkOpsSection
            pendingAction={pendingAction}
            onClear={() => setPendingAction(null)}
          />
        )}
      </div>
    </div>
  )
}

// ─── Bulk Ops section ─────────────────────────────────────────────────────────

interface BulkProgress {
  done: number
  total: number
  errors: number
  log: string[]
}

function BulkOpsSection({ pendingAction, onClear }: {
  pendingAction: PendingAction | null
  onClear: () => void
}) {
  const [activeAction, setActiveAction] = useState<BulkAction>(pendingAction?.action ?? null)
  const [selectedIds, setSelectedIds] = useState<string[]>(pendingAction?.itemIds ?? [])
  const [progress, setProgress] = useState<BulkProgress | null>(null)
  const [done, setDone] = useState(false)

  // Reprice state
  const [repriceMode, setRepriceMode] = useState<'lower' | 'raise' | 'set' | 'round'>('lower')
  const [repriceValue, setRepriceValue] = useState(10)

  // Edit state
  const [editMode, setEditMode] = useState<'find-replace' | 'append'>('find-replace')
  const [editTarget, setEditTarget] = useState<'title' | 'description'>('title')
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [appendText, setAppendText] = useState('')

  useEffect(() => {
    if (pendingAction) {
      setActiveAction(pendingAction.action)
      setSelectedIds(pendingAction.itemIds)
    }
  }, [pendingAction])

  const runBulkOperation = useCallback(async () => {
    if (!activeAction || selectedIds.length === 0) return
    setProgress({ done: 0, total: selectedIds.length, errors: 0, log: [] })
    setDone(false)

    const addLog = (msg: string) =>
      setProgress(p => p ? { ...p, log: [...p.log, msg] } : p)

    try {
      await chrome.runtime.sendMessage({
        type: 'BULK_CATALOG_OP',
        action: activeAction,
        itemIds: selectedIds,
        options: {
          repriceMode, repriceValue,
          editMode, editTarget, findText, replaceText, appendText,
        },
        onProgress: null,  // can't pass functions, handled via session storage updates
      })
    } catch {
      addLog('Error: could not reach content script')
    }

    // Poll progress from session storage
    const pollInterval = setInterval(async () => {
      const data: any = await chrome.storage.session.get('bulkOpProgress')
      const prog = data?.bulkOpProgress
      if (!prog) return

      setProgress({
        done: prog.done,
        total: prog.total,
        errors: prog.errors,
        log: prog.log ?? [],
      })

      if (prog.done >= prog.total) {
        clearInterval(pollInterval)
        setDone(true)
        chrome.storage.session.remove('bulkOpProgress')
      }
    }, 300)

    // Timeout after 5 minutes
    setTimeout(() => clearInterval(pollInterval), 300_000)
  }, [activeAction, selectedIds, repriceMode, repriceValue, editMode, editTarget, findText, replaceText, appendText])

  if (!activeAction || selectedIds.length === 0) {
    return (
      <div style={emptyState}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚙</div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
          No items selected
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.6 }}>
          Go to your Vinted catalog page and use the toolbar to select items.
          Then choose an action (Reprice, Repost, Duplicate, Edit).
        </div>
      </div>
    )
  }

  return (
    <div style={colGap}>
      {/* Header */}
      <Card title={`⚙ Bulk ${capitalize(activeAction ?? '')} — ${selectedIds.length} items`}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {selectedIds.length} item{selectedIds.length !== 1 ? 's' : ''} selected
        </div>
        <button
          onClick={onClear}
          style={{ ...secondaryBtn, fontSize: '10px', padding: '4px 8px', alignSelf: 'flex-start' }}
        >
          ✕ Clear selection
        </button>
      </Card>

      {/* Action-specific options */}
      {activeAction === 'reprice' && (
        <Card title="💰 Reprice Options">
          <Row label="Mode">
            <select
              value={repriceMode}
              onChange={(e: any) => setRepriceMode(e.target.value)}
              style={selectStyle}
            >
              <option value="lower">Lower by %</option>
              <option value="raise">Raise by %</option>
              <option value="set">Set to €</option>
              <option value="round">Round to €0.50</option>
            </select>
          </Row>
          {repriceMode !== 'round' && (
            <Row label={repriceMode === 'set' ? 'Price (€)' : 'Amount (%)'}>
              <input
                type="number" value={repriceValue} min={0}
                max={repriceMode === 'lower' || repriceMode === 'raise' ? 100 : 9999}
                step={repriceMode === 'set' ? 0.5 : 1}
                onInput={(e: any) => setRepriceValue(Number(e.target.value))}
                style={numInputStyle}
              />
            </Row>
          )}
        </Card>
      )}

      {activeAction === 'edit' && (
        <Card title="✏ Edit Options">
          <Row label="Target">
            <select value={editTarget} onChange={(e: any) => setEditTarget(e.target.value)} style={selectStyle}>
              <option value="title">Title</option>
              <option value="description">Description</option>
            </select>
          </Row>
          <Row label="Mode">
            <select value={editMode} onChange={(e: any) => setEditMode(e.target.value)} style={selectStyle}>
              <option value="find-replace">Find & Replace</option>
              <option value="append">Append to end</option>
            </select>
          </Row>
          {editMode === 'find-replace' ? (
            <>
              <Row label="Find">
                <input
                  value={findText} onInput={(e: any) => setFindText(e.target.value)}
                  placeholder="text to find…" style={{ ...numInputStyle, width: '120px' }}
                />
              </Row>
              <Row label="Replace with">
                <input
                  value={replaceText} onInput={(e: any) => setReplaceText(e.target.value)}
                  placeholder="replacement…" style={{ ...numInputStyle, width: '120px' }}
                />
              </Row>
            </>
          ) : (
            <Row label="Append text">
              <input
                value={appendText} onInput={(e: any) => setAppendText(e.target.value)}
                placeholder="text to add…" style={{ ...numInputStyle, width: '140px' }}
              />
            </Row>
          )}
        </Card>
      )}

      {activeAction === 'repost' && (
        <Card title="♻ Repost / Bump">
          <Hint>
            Bumps selected items to refresh their position in search results.
            Items already bumped in the last 24h will be skipped.
          </Hint>
        </Card>
      )}

      {activeAction === 'duplicate' && (
        <Card title="📋 Duplicate">
          <Hint>
            Creates copies of selected items as new listings.
            Copies get &ldquo; (copy)&rdquo; appended to their title. Max 5 per run.
          </Hint>
        </Card>
      )}

      {/* Run / Progress */}
      {!progress ? (
        <button onClick={runBulkOperation} style={runBtn}>
          Run {capitalize(activeAction)} on {selectedIds.length} items
        </button>
      ) : (
        <Card title="⏳ Progress">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1, height: '6px', borderRadius: '999px', background: 'var(--surface-hover)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: '999px',
                width: `${progress.total > 0 ? (progress.done / progress.total * 100) : 0}%`,
                background: done ? 'var(--success)' : 'var(--accent)',
                transition: 'width 0.3s',
              }} />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>
              {progress.done}/{progress.total}
            </span>
          </div>
          {progress.errors > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--danger)' }}>
              {progress.errors} error{progress.errors !== 1 ? 's' : ''}
            </div>
          )}
          {done && (
            <div style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 700 }}>
              ✓ Done!
            </div>
          )}
          {progress.log.length > 0 && (
            <div style={{
              maxHeight: '80px', overflowY: 'auto',
              fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
              lineHeight: 1.6,
            }}>
              {progress.log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

// ─── Restocker sub-section ────────────────────────────────────────────────────

function RestockerSection() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [soldItems, setSoldItems] = useState<SoldItemEntry[]>([])
  const [saved, setSaved] = useState(false)
  const [reposting, setReposting] = useState<Set<string>>(new Set())

  useEffect(() => {
    syncStorage.getSettings().then(setSettings)
    localStore.getSoldItems().then(items => setSoldItems([...items].reverse()))
  }, [])

  const s = settings.restocker

  const set = (key: keyof typeof s, value: any) => {
    setSettings(prev => ({ ...prev, restocker: { ...prev.restocker, [key]: value } }))
  }

  const save = async () => {
    await syncStorage.saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleManualRepost = async (item: SoldItemEntry) => {
    setReposting(prev => new Set(prev).add(item.id))
    try {
      await chrome.runtime.sendMessage({ type: 'REPOST_ITEM', itemId: item.id })
      setSoldItems(prev => prev.map(i => i.id === item.id ? { ...i, repostedAt: Date.now() } : i))
    } catch {
      setSoldItems(prev => prev.map(i => i.id === item.id ? { ...i, repostedAt: Date.now() } : i))
    } finally {
      setReposting(prev => { const next = new Set(prev); next.delete(item.id); return next })
    }
  }

  const clearReposted = async () => {
    const remaining = soldItems.filter(i => !i.repostedAt)
    await chrome.storage.local.set({ soldItems: remaining })
    setSoldItems(remaining)
  }

  const pendingCount = soldItems.filter(i => !i.repostedAt).length
  const repostedCount = soldItems.filter(i => i.repostedAt).length

  return (
    <div style={colGap}>
      <Card title="♻ Restocker">
        <Row label="Enabled">
          <Toggle value={s.enabled} onChange={v => set('enabled', v)} />
        </Row>
        {s.enabled && (
          <>
            <Row label="Auto-Repost">
              <Toggle value={s.autoRepost} onChange={v => set('autoRepost', v)} />
            </Row>
            {s.autoRepost && (
              <Row label="Delay (hours)">
                <input
                  type="number" value={s.delayHours} min={0} max={168}
                  onInput={(e: any) => set('delayHours', Number(e.target.value))}
                  style={numInputStyle}
                />
              </Row>
            )}
          </>
        )}
        <Hint>
          Detects when items sell and tracks them here.
          {s.autoRepost
            ? ` Auto-reposts after ${s.delayHours === 0 ? 'the next poll' : `${s.delayHours}h`}.`
            : ' Use the Repost button to manually relist items.'}
        </Hint>
      </Card>

      <SaveButton save={save} saved={saved} />

      {soldItems.length > 0 && (
        <div style={{ display: 'flex', gap: '8px' }}>
          <StatPill label="Pending" value={pendingCount} accent="var(--warn)" />
          <StatPill label="Reposted" value={repostedCount} accent="var(--success)" />
        </div>
      )}

      {soldItems.length > 0 ? (
        <Card title="📦 Sold Items">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {soldItems.map(item => (
              <SoldItemRow
                key={item.id}
                item={item}
                isReposting={reposting.has(item.id)}
                onRepost={() => handleManualRepost(item)}
              />
            ))}
          </div>
          {repostedCount > 0 && (
            <button onClick={clearReposted} style={{ ...secondaryBtn, marginTop: '8px', width: '100%' }}>
              Clear {repostedCount} reposted
            </button>
          )}
        </Card>
      ) : (
        <div style={emptyState}>
          No sold items tracked yet.
          {'\n'}Enable the Restocker and run the automation.
        </div>
      )}
    </div>
  )
}

function SoldItemRow({ item, isReposting, onRepost }: {
  item: SoldItemEntry
  isReposting: boolean
  onRepost: () => void
}) {
  const soldDate = new Date(item.soldAt).toLocaleDateString()
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px', padding: '8px',
      borderRadius: 'var(--radius-sm)', background: 'var(--surface-hover)',
      border: '1px solid var(--border)',
    }}>
      {item.thumbnailUrl && (
        <img src={item.thumbnailUrl} alt="" style={{ width: '36px', height: '36px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.title}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
          {item.price.toFixed(2)} {item.currency} · sold {soldDate}
        </div>
      </div>
      {item.repostedAt ? (
        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--success)', background: 'var(--success-dim)', padding: '3px 8px', borderRadius: '999px', flexShrink: 0 }}>
          ✓ Reposted
        </span>
      ) : (
        <button
          onClick={onRepost} disabled={isReposting}
          style={{ padding: '5px 10px', borderRadius: 'var(--radius-xs)', border: 'none', cursor: isReposting ? 'default' : 'pointer', background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: '10px', fontWeight: 700, flexShrink: 0, opacity: isReposting ? 0.6 : 1 }}
        >
          {isReposting ? '…' : 'Repost'}
        </button>
      )}
    </div>
  )
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: any }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: any }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1 }}>{label}</span>
      {children}
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{ width: '36px', height: '20px', borderRadius: '999px', cursor: 'pointer', background: value ? 'var(--accent)' : 'var(--surface-hover)', border: '1px solid var(--border-strong)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
    >
      <div style={{ position: 'absolute', top: '3px', left: value ? '17px' : '3px', width: '12px', height: '12px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
    </div>
  )
}

function Hint({ children }: { children: any }) {
  return <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>{children}</div>
}

function SaveButton({ save, saved }: { save: () => void; saved: boolean }) {
  return (
    <button onClick={save} style={{ padding: '10px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '12px', background: saved ? 'var(--success-dim)' : 'var(--accent-dim)', color: saved ? 'var(--success)' : 'var(--accent)', transition: 'all 0.2s ease' }}>
      {saved ? '✓ Saved' : 'Save'}
    </button>
  )
}

function StatPill({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div style={{ flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', border: '1px solid var(--border)', textAlign: 'center' }}>
      <div style={{ fontSize: '18px', fontWeight: 800, color: accent }}>{value}</div>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{label}</div>
    </div>
  )
}

// ─── Style constants ──────────────────────────────────────────────────────────

const colGap: any = { display: 'flex', flexDirection: 'column', gap: '10px' }

const emptyState: any = {
  textAlign: 'center', padding: '24px 16px',
  color: 'var(--text-muted)', fontSize: '12px', whiteSpace: 'pre-line',
  background: 'var(--surface)', borderRadius: 'var(--radius)',
  border: '1px solid var(--border)',
}

const secondaryBtn: any = {
  padding: '7px 12px', borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-strong)', cursor: 'pointer',
  fontWeight: 600, fontSize: '11px',
  background: 'transparent', color: 'var(--text-secondary)',
}

const runBtn: any = {
  padding: '12px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
  fontWeight: 800, fontSize: '12px',
  background: 'var(--accent-dim)', color: 'var(--accent)',
  transition: 'all 0.2s ease',
}

const selectStyle: any = {
  padding: '5px 8px', background: 'var(--surface-hover)',
  border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-xs)',
  color: 'var(--text)', fontSize: '12px', outline: 'none',
}

const numInputStyle: any = {
  width: '64px', padding: '5px 8px', textAlign: 'center',
  background: 'var(--surface-hover)', border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-xs)', color: 'var(--text)', fontSize: '12px',
  fontWeight: 700, outline: 'none',
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : ''
}
