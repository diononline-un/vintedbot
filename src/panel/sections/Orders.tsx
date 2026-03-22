/**
 * Orders section — Shipping Labels (P3-01), Bulk Feedback (P3-02), Deadline Extensions (P3-03)
 */
import { useState, useEffect } from 'preact/hooks'
import type { VintedOrder } from '@/lib/types'

type SubSection = 'labels' | 'feedback' | 'deadlines'

export function Orders() {
  const [sub, setSub] = useState<SubSection>('labels')
  const [orders, setOrders] = useState<VintedOrder[]>([])
  const [loading, setLoading] = useState(false)

  const loadOrders = async () => {
    setLoading(true)
    try {
      const res = await chrome.runtime.sendMessage({ type: 'FETCH_ORDERS' })
      setOrders(res?.orders ?? [])
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadOrders() }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
      {/* Sub-nav */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '3px', flexShrink: 0 }}>
        {([
          ['labels',    '🏷 Labels'],
          ['feedback',  '⭐ Feedback'],
          ['deadlines', '⏰ Deadlines'],
        ] as [SubSection, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSub(id)}
            style={{
              padding: '5px 0', borderRadius: 'var(--radius-sm)', border: 'none',
              background: sub === id ? 'var(--surface-active)' : 'var(--surface)',
              color: sub === id ? 'var(--text)' : 'var(--text-muted)',
              fontWeight: sub === id ? 700 : 500, fontSize: '10px', cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <button onClick={loadOrders} disabled={loading} style={refreshBtn}>
        {loading ? '⟳ Loading…' : '⟳ Refresh orders'}
      </button>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sub === 'labels'    && <LabelsSection orders={orders} loading={loading} />}
        {sub === 'feedback'  && <FeedbackSection orders={orders} />}
        {sub === 'deadlines' && <DeadlinesSection orders={orders} />}
      </div>
    </div>
  )
}

// ─── P3-01: Labels ────────────────────────────────────────────────────────────

function LabelsSection({ orders, loading }: { orders: VintedOrder[]; loading: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState(false)
  const [result, setResult] = useState('')

  const ordersWithLabel = orders.filter(o => o.shipmentId)

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const downloadLabels = async () => {
    if (selected.size === 0) return
    setDownloading(true)
    setResult('')
    try {
      const selectedOrders = ordersWithLabel.filter(o => selected.has(o.id))
      const res = await chrome.runtime.sendMessage({ type: 'DOWNLOAD_LABELS', orders: selectedOrders })
      setResult(res?.ok ? `✓ Downloaded ${selected.size} label(s)` : '✗ Download failed')
    } catch (err) {
      setResult('✗ Error: ' + String(err).slice(0, 50))
    } finally {
      setDownloading(false)
    }
  }

  if (loading) return <LoadingState />
  if (ordersWithLabel.length === 0) return <EmptyState icon="🏷" message="No orders with shipping labels found." />

  return (
    <div style={colGap}>
      <Card title={`🏷 Shipping Labels — ${ordersWithLabel.length} orders`}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setSelected(new Set(ordersWithLabel.map(o => o.id)))} style={secondaryBtn}>
            Select all
          </button>
          <button onClick={downloadLabels} disabled={selected.size === 0 || downloading} style={{ ...primaryBtn(downloading), flex: 1 }}>
            {downloading ? 'Merging PDF…' : `⬇ Download ${selected.size > 0 ? selected.size : ''} label(s)`}
          </button>
        </div>
        {result && (
          <div style={{ fontSize: '11px', color: result.startsWith('✓') ? 'var(--success)' : 'var(--danger)' }}>
            {result}
          </div>
        )}
        <Hint>Merges up to 25 labels into one print-ready PDF.</Hint>
      </Card>
      {ordersWithLabel.map(order => (
        <OrderRow key={order.id} order={order} checked={selected.has(order.id)} onToggle={() => toggle(order.id)} />
      ))}
    </div>
  )
}

// ─── P3-02: Feedback ──────────────────────────────────────────────────────────

function FeedbackSection({ orders }: { orders: VintedOrder[] }) {
  const pending = orders.filter(o => !o.feedbackLeft && o.status === 'completed')
  const [template, setTemplate] = useState('Thank you @buyer_name for buying "@item_name"! It was a pleasure. 😊')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)

  const run = async () => {
    if (pending.length === 0) return
    setRunning(true); setDone(false)
    setProgress({ done: 0, total: pending.length })
    const res = await chrome.runtime.sendMessage({ type: 'BULK_FEEDBACK', orders: pending, template })
    setProgress({ done: res?.done ?? 0, total: pending.length })
    setDone(true); setRunning(false)
  }

  if (pending.length === 0) return <EmptyState icon="⭐" message="No completed orders awaiting feedback." />

  return (
    <div style={colGap}>
      <Card title={`⭐ Leave Feedback — ${pending.length} pending`}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Feedback template</div>
        <textarea value={template} onInput={(e: any) => setTemplate(e.target.value)} rows={3} style={textareaStyle} />
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {['@buyer_name', '@item_name'].map(v => <span key={v} style={varBadge}>{v}</span>)}
        </div>
        <button onClick={run} disabled={running} style={primaryBtn(running)}>
          {running ? `Submitting ${progress?.done ?? 0}/${progress?.total ?? 0}…` : `Leave feedback for all ${pending.length}`}
        </button>
        {done && <div style={{ fontSize: '11px', color: 'var(--success)' }}>✓ Feedback submitted!</div>}
      </Card>
      {pending.map(order => <OrderRow key={order.id} order={order} compact />)}
    </div>
  )
}

// ─── P3-03: Deadlines ─────────────────────────────────────────────────────────

function DeadlinesSection({ orders }: { orders: VintedOrder[] }) {
  const now = Date.now()
  const upcoming = orders.filter(o =>
    o.shippingDeadlineAt && o.shippingDeadlineAt - now < 24 * 60 * 60 * 1000
    && o.status === 'awaiting_shipment'
  )
  const [template, setTemplate] = useState('Hi @buyer_name, "@item_name" will ship very soon — thank you for your patience!')
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState<string | null>(null)

  const sendNotice = async (order: VintedOrder) => {
    setSending(order.id)
    try {
      const res = await chrome.runtime.sendMessage({ type: 'REQUEST_DEADLINE_EXTENSION', order, template })
      if (res?.ok) setSentIds(prev => new Set(prev).add(order.id))
    } finally {
      setSending(null)
    }
  }

  if (upcoming.length === 0) return <EmptyState icon="⏰" message="No orders approaching their shipping deadline." />

  return (
    <div style={colGap}>
      <Card title={`⏰ Approaching Deadlines — ${upcoming.length} orders`}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Message template</div>
        <textarea value={template} onInput={(e: any) => setTemplate(e.target.value)} rows={3} style={textareaStyle} />
        <Hint>Sends a message to the buyer. Courtesy notice — no direct extension API.</Hint>
      </Card>
      {upcoming.map(order => {
        const hoursLeft = order.shippingDeadlineAt ? Math.max(0, Math.round((order.shippingDeadlineAt - now) / 3600000)) : null
        return (
          <div key={order.id} style={{ ...orderCard, cursor: 'default' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={orderTitle}>{order.itemTitle}</div>
              <div style={orderMeta}>@{order.buyerLogin} · {order.salePrice.toFixed(2)} {order.currency}</div>
              {hoursLeft !== null && (
                <div style={{ fontSize: '10px', color: hoursLeft < 6 ? 'var(--danger)' : 'var(--warn)', marginTop: '2px' }}>
                  ⏰ {hoursLeft}h remaining
                </div>
              )}
            </div>
            {sentIds.has(order.id) ? (
              <span style={successBadge}>✓ Sent</span>
            ) : (
              <button onClick={() => sendNotice(order)} disabled={sending === order.id} style={actionBtn(sending === order.id)}>
                {sending === order.id ? '…' : 'Send notice'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function OrderRow({ order, checked, onToggle, compact }: {
  order: VintedOrder; checked?: boolean; onToggle?: () => void; compact?: boolean
}) {
  return (
    <div style={{ ...orderCard, cursor: onToggle ? 'pointer' : 'default' }} onClick={onToggle}>
      {onToggle && (
        <input type="checkbox" checked={checked} onChange={onToggle}
          style={{ flexShrink: 0, cursor: 'pointer', accentColor: 'var(--accent)' }}
          onClick={(e: any) => e.stopPropagation()}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={orderTitle}>{order.itemTitle}</div>
        <div style={orderMeta}>
          @{order.buyerLogin} · {order.salePrice.toFixed(2)} {order.currency}
          {!compact && order.status && ` · ${order.status.replace(/_/g, ' ')}`}
        </div>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: any }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</div>
      {children}
    </div>
  )
}

function Hint({ children }: { children: any }) {
  return <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>{children}</div>
}

function LoadingState() {
  return <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12px' }}>Loading orders…</div>
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-muted)', fontSize: '12px', background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: '24px', marginBottom: '8px' }}>{icon}</div>
      {message}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const colGap: any = { display: 'flex', flexDirection: 'column', gap: '10px' }
const refreshBtn: any = { padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: '11px', cursor: 'pointer', flexShrink: 0 }
const primaryBtn = (disabled: boolean): any => ({ padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: disabled ? 'default' : 'pointer', fontWeight: 700, fontSize: '11px', background: 'var(--accent-dim)', color: 'var(--accent)', opacity: disabled ? 0.6 : 1, transition: 'opacity 0.15s' })
const secondaryBtn: any = { padding: '7px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', cursor: 'pointer', fontWeight: 600, fontSize: '11px', background: 'transparent', color: 'var(--text-secondary)' }
const orderCard: any = { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer' }
const orderTitle: any = { fontSize: '12px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const orderMeta: any = { fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }
const textareaStyle: any = { width: '100%', background: 'var(--surface-hover)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontSize: '11px', padding: '7px 10px', fontFamily: 'var(--font)', resize: 'vertical', outline: 'none', lineHeight: 1.5 }
const varBadge: any = { fontSize: '10px', fontFamily: 'var(--font-mono)', background: 'var(--accent-dim)', color: 'var(--accent)', padding: '2px 6px', borderRadius: 'var(--radius-xs)' }
const successBadge: any = { fontSize: '10px', fontWeight: 700, color: 'var(--success)', background: 'var(--success-dim)', padding: '3px 8px', borderRadius: '999px', flexShrink: 0 }
const actionBtn = (disabled: boolean): any => ({ padding: '5px 10px', borderRadius: 'var(--radius-xs)', border: 'none', cursor: disabled ? 'default' : 'pointer', background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: '10px', fontWeight: 700, flexShrink: 0, opacity: disabled ? 0.6 : 1 })
