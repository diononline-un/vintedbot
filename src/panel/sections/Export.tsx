/**
 * Export section — P4-01 (Catalog CSV/JSON), P4-02 (Transaction History), P4-03 (Photo Filters)
 */
import { useState } from 'preact/hooks'

type SubSection = 'catalog' | 'transactions' | 'photos'

export function Export() {
  const [sub, setSub] = useState<SubSection>('catalog')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
      {/* Sub-nav */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '3px', flexShrink: 0 }}>
        {([
          ['catalog',      '📦 Catalog'],
          ['transactions', '💰 Sales'],
          ['photos',       '🖼 Photos'],
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

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sub === 'catalog'      && <CatalogExportSection />}
        {sub === 'transactions' && <TransactionsExportSection />}
        {sub === 'photos'       && <PhotoFiltersSection />}
      </div>
    </div>
  )
}

// ─── P4-01: Catalog Export ────────────────────────────────────────────────────

function CatalogExportSection() {
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [scope, setScope] = useState<'all' | 'active' | 'sold'>('all')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState('')

  const run = async () => {
    setRunning(true)
    setResult('')
    try {
      const res = await chrome.runtime.sendMessage({ type: 'EXPORT_CATALOG', format, scope })
      setResult(res?.ok ? `✓ Exported ${res.count ?? ''} items` : '✗ Export failed')
    } catch (err) {
      setResult('✗ ' + String(err).slice(0, 60))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={colGap}>
      <Card title="📦 Export Catalog">
        <Row label="Format">
          <select value={format} onChange={(e: any) => setFormat(e.target.value)} style={selectStyle}>
            <option value="csv">CSV (Google Sheets compatible)</option>
            <option value="json">JSON (full API data)</option>
          </select>
        </Row>
        <Row label="Status filter">
          <select value={scope} onChange={(e: any) => setScope(e.target.value)} style={selectStyle}>
            <option value="all">All items</option>
            <option value="active">Active only</option>
            <option value="sold">Sold only</option>
          </select>
        </Row>
        <Hint>
          Exports all your listings with title, price, condition, category, status, views, and URL.
          Paginated — may take a moment for large catalogs.
        </Hint>
        <button onClick={run} disabled={running} style={runBtn(running)}>
          {running ? 'Fetching catalog…' : `⬇ Export as ${format.toUpperCase()}`}
        </button>
        {result && (
          <div style={{ fontSize: '11px', color: result.startsWith('✓') ? 'var(--success)' : 'var(--danger)' }}>
            {result}
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── P4-02: Transaction History ───────────────────────────────────────────────

function TransactionsExportSection() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState('')

  const run = async () => {
    setRunning(true)
    setResult('')
    try {
      const res = await chrome.runtime.sendMessage({ type: 'EXPORT_TRANSACTIONS' })
      setResult(res?.ok ? `✓ Exported ${res.count ?? ''} transactions` : '✗ Export failed')
    } catch (err) {
      setResult('✗ ' + String(err).slice(0, 60))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={colGap}>
      <Card title="💰 Sales History">
        <Hint>
          Exports completed sales: date, item title, price, buyer login, tracking number.
          CSV format compatible with spreadsheets and accounting tools.
        </Hint>
        <button onClick={run} disabled={running} style={runBtn(running)}>
          {running ? 'Fetching transactions…' : '⬇ Export sales history (CSV)'}
        </button>
        {result && (
          <div style={{ fontSize: '11px', color: result.startsWith('✓') ? 'var(--success)' : 'var(--danger)' }}>
            {result}
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── P4-03: Photo Filters ─────────────────────────────────────────────────────

function PhotoFiltersSection() {
  const [itemId, setItemId] = useState('')
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [saturation, setSaturation] = useState(100)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState('')

  const apply = async () => {
    if (!itemId.trim()) { setResult('✗ Enter an item ID'); return }
    setRunning(true)
    setResult('')
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'APPLY_PHOTO_FILTERS',
        itemId: itemId.trim(),
        filters: { brightness, contrast, saturation },
      })
      setResult(res?.ok ? `✓ Filters applied to ${res.photoCount ?? ''} photo(s)` : '✗ Failed: ' + (res?.error ?? 'unknown'))
    } catch (err) {
      setResult('✗ ' + String(err).slice(0, 60))
    } finally {
      setRunning(false)
    }
  }

  const restore = async () => {
    if (!itemId.trim()) return
    setRunning(true)
    try {
      const res = await chrome.runtime.sendMessage({ type: 'RESTORE_ORIGINAL_PHOTOS', itemId: itemId.trim() })
      setResult(res?.ok ? '✓ Original photos restored' : '✗ No backup found')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={colGap}>
      <Card title="🖼 Photo Filters">
        <Row label="Item ID">
          <input
            value={itemId}
            onInput={(e: any) => setItemId(e.target.value)}
            placeholder="12345678"
            style={{ ...selectStyle, width: '120px' }}
          />
        </Row>
        <Row label="Brightness">
          <SliderInput value={brightness} min={50} max={150} onChange={setBrightness} />
        </Row>
        <Row label="Contrast">
          <SliderInput value={contrast} min={50} max={150} onChange={setContrast} />
        </Row>
        <Row label="Saturation">
          <SliderInput value={saturation} min={0} max={200} onChange={setSaturation} />
        </Row>
        <Hint>
          Applies CSS-style filters to item photos using Canvas API.
          Originals are backed up before modification and can be restored.
        </Hint>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={apply} disabled={running} style={{ ...runBtn(running), flex: 1 }}>
            {running ? 'Applying…' : '✓ Apply filters'}
          </button>
          <button onClick={restore} disabled={running} style={secondaryBtn}>
            Restore
          </button>
        </div>
        {result && (
          <div style={{ fontSize: '11px', color: result.startsWith('✓') ? 'var(--success)' : 'var(--danger)' }}>
            {result}
          </div>
        )}
      </Card>
    </div>
  )
}

function SliderInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <input
        type="range" value={value} min={min} max={max}
        onInput={(e: any) => onChange(Number(e.target.value))}
        style={{ width: '80px', accentColor: 'var(--accent)' }}
      />
      <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: '30px', textAlign: 'right' }}>
        {value}%
      </span>
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

function Hint({ children }: { children: any }) {
  return <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>{children}</div>
}

const colGap: any = { display: 'flex', flexDirection: 'column', gap: '10px' }

const runBtn = (disabled: boolean): any => ({
  padding: '10px', borderRadius: 'var(--radius-sm)', border: 'none',
  cursor: disabled ? 'default' : 'pointer', fontWeight: 800, fontSize: '12px',
  background: 'var(--accent-dim)', color: 'var(--accent)',
  opacity: disabled ? 0.6 : 1, transition: 'all 0.2s ease',
})

const secondaryBtn: any = {
  padding: '7px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)',
  cursor: 'pointer', fontWeight: 600, fontSize: '11px',
  background: 'transparent', color: 'var(--text-secondary)',
}

const selectStyle: any = {
  padding: '5px 8px', background: 'var(--surface-hover)',
  border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-xs)',
  color: 'var(--text)', fontSize: '12px', outline: 'none',
}
