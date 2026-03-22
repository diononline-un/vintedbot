import { useState, useEffect } from 'preact/hooks'
import { syncStorage, DEFAULT_SETTINGS } from '@/storage'
import type { Settings } from '@/lib/types'

export function Rules() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [saved, setSaved] = useState(false)

  useEffect(() => { syncStorage.getSettings().then(setSettings) }, [])

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

  const r = settings.offerRules

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%', overflowY: 'auto' }}>

      {/* Offer rules */}
      <Section title="⚡ Offer Rules">
        <Row label="Counter at (% of price)">
          <NumInput value={r.counterAtPercent} min={50} max={99}
            onChange={v => set(['offerRules', 'counterAtPercent'], v)} />
        </Row>
        <Row label="Auto-accept above (%)">
          <NumInput value={r.autoAcceptAbovePercent} min={50} max={100}
            onChange={v => set(['offerRules', 'autoAcceptAbovePercent'], v)} />
        </Row>
        <Row label="Max offers / conversation">
          <NumInput value={r.maxOffersPerConversation} min={1} max={10}
            onChange={v => set(['offerRules', 'maxOffersPerConversation'], v)} />
        </Row>
        <Row label="Max offers / day">
          <NumInput value={r.maxOffersPerDay} min={1} max={200}
            onChange={v => set(['offerRules', 'maxOffersPerDay'], v)} />
        </Row>
        <Row label="Poll every (seconds)">
          <NumInput value={r.pollIntervalSeconds} min={30} max={300}
            onChange={v => set(['offerRules', 'pollIntervalSeconds'], v)} />
        </Row>
        <Row label="Fallback to message">
          <Toggle value={r.fallbackToMessage}
            onChange={v => set(['offerRules', 'fallbackToMessage'], v)} />
        </Row>
      </Section>

      {/* Message templates */}
      <Section title="💬 Message Templates">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={labelStyle}>Fallback message (when offer limit hit)</label>
          <textarea
            value={settings.messageTemplates.fallback}
            onInput={(e: any) => set(['messageTemplates', 'fallback'], e.target.value)}
            rows={3}
            style={textareaStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
          <label style={labelStyle}>Greeting message (optional, on first contact)</label>
          <textarea
            value={settings.messageTemplates.greeting}
            onInput={(e: any) => set(['messageTemplates', 'greeting'], e.target.value)}
            rows={2}
            style={textareaStyle}
            placeholder="Leave empty to skip"
          />
        </div>
      </Section>

      <button onClick={save} style={saveBtn(saved)}>
        {saved ? '✓ Saved' : 'Save Rules'}
      </button>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: any }) {
  return (
    <div style={{
      background: 'var(--surface)', backdropFilter: 'var(--blur)',
      WebkitBackdropFilter: 'var(--blur)', border: '1px solid var(--border)',
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

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: '36px', height: '20px', borderRadius: '999px', cursor: 'pointer',
        background: value ? 'var(--accent)' : 'var(--surface-hover)',
        border: '1px solid var(--border-strong)',
        position: 'relative', transition: 'background 0.2s',
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

const labelStyle: any = { fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }

const textareaStyle: any = {
  background: 'var(--surface-hover)', border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontSize: '12px',
  padding: '8px 10px', fontFamily: 'var(--font)', resize: 'vertical', outline: 'none', lineHeight: 1.5,
}

const saveBtn = (saved: boolean): any => ({
  padding: '10px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
  fontWeight: 800, fontSize: '12px', letterSpacing: '0.02em',
  background: saved ? 'var(--success-dim)' : 'var(--accent-dim)',
  color: saved ? 'var(--success)' : 'var(--accent)',
  transition: 'all 0.2s ease',
})
