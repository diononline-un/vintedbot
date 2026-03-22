/**
 * Inbox section — offer rules + auto-messages + like automation
 * Tickets: F-01 (shell), P1-01 (like messages), P1-02 (accepted offer), P1-03 (like offer), P1-05 (mark read)
 */
import { useState, useEffect } from 'preact/hooks'
import { syncStorage, DEFAULT_SETTINGS } from '@/storage'
import type { Settings } from '@/lib/types'
import { Rules } from '../Rules'

type SubSection = 'offers' | 'like-messages' | 'accepted' | 'like-offers'

// ─── Mark All Read helper (P1-05) ─────────────────────────────────────────────
// Calls the content script via chrome.runtime message forwarding

async function markAllRead(
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_UNREAD_THREAD_IDS' })
    const ids: string[] = response?.ids ?? []
    const total = ids.length
    for (let i = 0; i < ids.length; i++) {
      await chrome.runtime.sendMessage({ type: 'MARK_THREAD_READ', threadId: ids[i] })
      onProgress(i + 1, total)
      await new Promise(r => setTimeout(r, 300))  // 300ms rate limit
    }
  } catch (err) {
    console.warn('[VintedAuto] markAllRead error:', err)
  }
}

export function Inbox() {
  const [sub, setSub] = useState<SubSection>('offers')
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [saved, setSaved]       = useState(false)
  const [markReadState, setMarkReadState] = useState<
    { status: 'idle' } | { status: 'busy'; done: number; total: number } | { status: 'done' }
  >({ status: 'idle' })

  useEffect(() => { syncStorage.getSettings().then(setSettings) }, [])

  const handleMarkAllRead = async () => {
    setMarkReadState({ status: 'busy', done: 0, total: 0 })
    await markAllRead((done, total) => setMarkReadState({ status: 'busy', done, total }))
    setMarkReadState({ status: 'done' })
    setTimeout(() => setMarkReadState({ status: 'idle' }), 3000)
  }

  const set = (path: string[], value: any) => {
    setSettings(prev => {
      const next = structuredClone(prev)
      let obj: any = next
      for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]]
      obj[path[path.length - 1]] = value
      return next
    })
  }

  const save = async () => {
    await syncStorage.saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>

      {/* Mark All Read toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <button
          onClick={handleMarkAllRead}
          disabled={markReadState.status === 'busy'}
          style={{
            flex: 1, padding: '7px 10px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)', cursor: markReadState.status === 'busy' ? 'default' : 'pointer',
            background: markReadState.status === 'done' ? 'var(--success-dim)' : 'var(--surface)',
            color: markReadState.status === 'done' ? 'var(--success)' : 'var(--text-muted)',
            fontSize: '11px', fontWeight: 600,
            transition: 'all 0.2s',
          }}
        >
          {markReadState.status === 'idle' && '✓ Mark all as read'}
          {markReadState.status === 'busy' && `Marking ${markReadState.done}/${markReadState.total}…`}
          {markReadState.status === 'done' && '✓ All marked as read'}
        </button>
      </div>

      {/* Sub-nav */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
        gap: '3px', flexShrink: 0,
      }}>
        {([
          ['offers',       '⚡ Offers'],
          ['like-messages','👍 Likes'],
          ['accepted',     '✅ Accepted'],
          ['like-offers',  '🏷 Discount'],
        ] as [SubSection, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSub(id)}
            style={{
              padding: '5px 0', borderRadius: 'var(--radius-sm)', border: 'none',
              background: sub === id ? 'var(--surface-active)' : 'var(--surface)',
              color: sub === id ? 'var(--text)' : 'var(--text-muted)',
              fontWeight: sub === id ? 700 : 500,
              fontSize: '10px', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Sub-section content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sub === 'offers' && <Rules />}

        {sub === 'like-messages' && (
          <LikeMessagesSection settings={settings} set={set} save={save} saved={saved} />
        )}

        {sub === 'accepted' && (
          <AcceptedOfferSection settings={settings} set={set} save={save} saved={saved} />
        )}

        {sub === 'like-offers' && (
          <LikeOffersSection settings={settings} set={set} save={save} saved={saved} />
        )}
      </div>
    </div>
  )
}

// ─── Like Messages sub-section ────────────────────────────────────────────────

function LikeMessagesSection({ settings, set, save, saved }: SectionProps) {
  const s = settings.likeMessages
  return (
    <div style={colGap}>
      <Card title="👍 Like Messages">
        <Row label="Enabled">
          <Toggle value={s.enabled} onChange={v => set(['likeMessages', 'enabled'], v)} />
        </Row>
        <Hint>
          When someone likes your item, automatically send them a message.
          Max 1 per user per 24 hours.
        </Hint>
      </Card>
      {s.enabled && (
        <Card title="💬 Message Template">
          <TemplateArea
            value={s.template}
            onChange={v => set(['likeMessages', 'template'], v)}
            variables={['@buyer_name', '@item_name', '@item_price']}
          />
        </Card>
      )}
      <SaveButton save={save} saved={saved} />
    </div>
  )
}

// ─── Accepted Offer sub-section ───────────────────────────────────────────────

function AcceptedOfferSection({ settings, set, save, saved }: SectionProps) {
  const s = settings.acceptedOfferMessage
  return (
    <div style={colGap}>
      <Card title="✅ Accepted Offer Message">
        <Row label="Enabled">
          <Toggle value={s.enabled} onChange={v => set(['acceptedOfferMessage', 'enabled'], v)} />
        </Row>
        <Hint>
          When a buyer accepts your counter-offer, automatically send a thank-you message.
          Sent once per transaction.
        </Hint>
      </Card>
      {s.enabled && (
        <Card title="💬 Message Template">
          <TemplateArea
            value={s.template}
            onChange={v => set(['acceptedOfferMessage', 'template'], v)}
            variables={['@item_name', '@sale_price']}
          />
        </Card>
      )}
      <SaveButton save={save} saved={saved} />
    </div>
  )
}

// ─── Like → Discount Offer sub-section ───────────────────────────────────────

function LikeOffersSection({ settings, set, save, saved }: SectionProps) {
  const s = settings.likeOffer
  return (
    <div style={colGap}>
      <Card title="🏷 Auto Discount Offers">
        <Row label="Enabled">
          <Toggle value={s.enabled} onChange={v => set(['likeOffer', 'enabled'], v)} />
        </Row>
        <Row label="Discount (%)">
          <NumInput
            value={s.discountPercent} min={1} max={50}
            onChange={v => set(['likeOffer', 'discountPercent'], v)}
          />
        </Row>
        <Hint>
          When someone likes your item, send them a private offer at a discount.
          Max 1 per user per 48 hours. If enabled, skips the like message above.
        </Hint>
        {settings.likeMessages.enabled && s.enabled && (
          <div style={warnBanner}>
            ⚠ Both Discount Offers and Like Messages are enabled.
            Only the discount offer will be sent (offers take priority).
          </div>
        )}
      </Card>
      <SaveButton save={save} saved={saved} />
    </div>
  )
}

// ─── Shared primitives ────────────────────────────────────────────────────────

interface SectionProps {
  settings: Settings
  set: (path: string[], value: any) => void
  save: () => Promise<void>
  saved: boolean
}

function Card({ title, children }: { title: string; children: any }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '14px',
      display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
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
      style={{
        width: '36px', height: '20px', borderRadius: '999px', cursor: 'pointer',
        background: value ? 'var(--accent)' : 'var(--surface-hover)',
        border: '1px solid var(--border-strong)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: '3px',
        left: value ? '17px' : '3px',
        width: '12px', height: '12px', borderRadius: '50%',
        background: 'white', transition: 'left 0.2s',
      }} />
    </div>
  )
}

function NumInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number" value={value} min={min} max={max}
      onInput={(e: any) => onChange(Number(e.target.value))}
      style={{
        width: '64px', padding: '5px 8px', textAlign: 'center',
        background: 'var(--surface-hover)', border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-xs)', color: 'var(--text)', fontSize: '12px',
        fontWeight: 700, outline: 'none',
      }}
    />
  )
}

function TemplateArea({ value, onChange, variables }: {
  value: string
  onChange: (v: string) => void
  variables: string[]
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <textarea
        value={value}
        onInput={(e: any) => onChange(e.target.value)}
        rows={4}
        style={{
          background: 'var(--surface-hover)', border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontSize: '12px',
          padding: '8px 10px', fontFamily: 'var(--font)', resize: 'vertical',
          outline: 'none', lineHeight: 1.5,
        }}
      />
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {variables.map(v => (
          <span key={v} style={{
            fontSize: '10px', fontFamily: 'var(--font-mono)',
            background: 'var(--accent-dim)', color: 'var(--accent)',
            padding: '2px 6px', borderRadius: 'var(--radius-xs)',
          }}>
            {v}
          </span>
        ))}
      </div>
    </div>
  )
}

function Hint({ children }: { children: any }) {
  return (
    <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
      {children}
    </div>
  )
}

function SaveButton({ save, saved }: { save: () => void; saved: boolean }) {
  return (
    <button
      onClick={save}
      style={{
        padding: '10px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
        fontWeight: 800, fontSize: '12px', letterSpacing: '0.02em',
        background: saved ? 'var(--success-dim)' : 'var(--accent-dim)',
        color: saved ? 'var(--success)' : 'var(--accent)',
        transition: 'all 0.2s ease',
      }}
    >
      {saved ? '✓ Saved' : 'Save'}
    </button>
  )
}

const colGap: any = { display: 'flex', flexDirection: 'column', gap: '10px' }

const warnBanner: any = {
  fontSize: '11px', color: 'var(--warn)',
  background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)',
  borderRadius: 'var(--radius-sm)', padding: '8px 10px', lineHeight: 1.6,
}
