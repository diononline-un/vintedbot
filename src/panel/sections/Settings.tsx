/**
 * Settings section — Anthropic API key, general toggles, storage info
 * Ticket: F-02
 */
import { useState, useEffect } from 'preact/hooks'
import { syncStorage, localStore, DEFAULT_SETTINGS } from '@/storage'
import type { Settings } from '@/lib/types'

type TestState = 'idle' | 'testing' | 'ok' | 'error'

export function Settings() {
  const [apiKey, setApiKey]         = useState('')
  const [keyInput, setKeyInput]     = useState('')
  const [showKey, setShowKey]       = useState(false)
  const [testState, setTestState]   = useState<TestState>('idle')
  const [testError, setTestError]   = useState('')
  const [saved, setSaved]           = useState(false)
  const [agentSaved, setAgentSaved] = useState(false)
  const [storageBytes, setStorageBytes] = useState<number | null>(null)
  const [clearing, setClearing]     = useState(false)
  const [settings, setSettings]     = useState<Settings>(DEFAULT_SETTINGS)

  useEffect(() => {
    syncStorage.getApiKey().then(k => { setApiKey(k); setKeyInput(k) })
    syncStorage.getSettings().then(setSettings)
    loadStorageInfo()
  }, [])

  const setAgent = (key: keyof Settings['smartAgent'], value: any) => {
    setSettings(prev => ({ ...prev, smartAgent: { ...prev.smartAgent, [key]: value } }))
  }

  const saveAgentSettings = async () => {
    await syncStorage.saveSettings(settings)
    setAgentSaved(true)
    setTimeout(() => setAgentSaved(false), 2000)
  }

  const loadStorageInfo = async () => {
    try {
      // chrome.storage.local.getBytesInUse returns a number
      const bytes: number = await new Promise(resolve =>
        chrome.storage.local.getBytesInUse(null, resolve)
      )
      setStorageBytes(bytes)
    } catch {
      // not available in all contexts
    }
  }

  const saveKey = async () => {
    await syncStorage.setApiKey(keyInput.trim())
    setApiKey(keyInput.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const testKey = async () => {
    const key = keyInput.trim()
    if (!key) { setTestState('error'); setTestError('Enter an API key first'); return }
    setTestState('testing')
    setTestError('')
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      })
      if (res.ok) {
        setTestState('ok')
        setTimeout(() => setTestState('idle'), 3000)
      } else {
        const body = await res.json().catch(() => ({}))
        setTestState('error')
        setTestError(body?.error?.message ?? `HTTP ${res.status}`)
      }
    } catch (e: any) {
      setTestState('error')
      setTestError(e?.message ?? 'Network error')
    }
  }

  const clearLogs = async () => {
    setClearing(true)
    await chrome.storage.local.set({ offerLog: [], messageLog: [] })
    await loadStorageInfo()
    setClearing(false)
  }

  const bytesLabel = storageBytes !== null
    ? `${(storageBytes / 1024).toFixed(1)} KB / 10 MB`
    : '—'

  const keyDirty = keyInput !== apiKey

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%', overflowY: 'auto' }}>

      {/* ── Anthropic API Key ── */}
      <Card title="🤖 Smart Agent (Claude API)">
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '8px' }}>
          Required for Smart Agent (AI replies). Get a key at{' '}
          <span style={{ color: 'var(--accent)' }}>console.anthropic.com</span>.{' '}
          Uses Claude Haiku — ~$0.001 per reply.
        </div>

        {/* Input row */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              placeholder="sk-ant-..."
              onInput={(e: any) => setKeyInput(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 32px 7px 10px',
                background: 'var(--surface-hover)',
                border: `1px solid ${testState === 'ok' ? 'var(--success)' : testState === 'error' ? 'var(--danger)' : 'var(--border-strong)'}`,
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
            />
            <button
              onClick={() => setShowKey(s => !s)}
              style={{
                position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', fontSize: '12px', padding: 0,
              }}
            >
              {showKey ? '🙈' : '👁'}
            </button>
          </div>
        </div>

        {/* Test error message */}
        {testState === 'error' && testError && (
          <div style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '4px' }}>
            ✗ {testError}
          </div>
        )}
        {testState === 'ok' && (
          <div style={{ fontSize: '11px', color: 'var(--success)', marginTop: '4px' }}>
            ✓ API key is valid
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
          <button
            onClick={testKey}
            disabled={testState === 'testing' || !keyInput.trim()}
            style={secondaryBtn(testState === 'testing')}
          >
            {testState === 'testing' ? '…Testing' : 'Test Key'}
          </button>
          <button
            onClick={saveKey}
            disabled={!keyDirty && !saved}
            style={primaryBtn(saved)}
          >
            {saved ? '✓ Saved' : 'Save Key'}
          </button>
        </div>

        {!apiKey && (
          <div style={{
            marginTop: '8px', padding: '7px 10px',
            background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)',
            borderRadius: 'var(--radius-sm)', fontSize: '11px', color: 'var(--warn)',
          }}>
            ⚠ Smart Agent is disabled until a valid API key is saved.
          </div>
        )}
      </Card>

      {/* ── Smart Agent Config ── */}
      <Card title="⚡ Smart Agent Config">
        <Row label="Enabled">
          <Toggle value={settings.smartAgent.enabled} onChange={v => setAgent('enabled', v)} />
        </Row>
        <Row label="Dry-run mode">
          <Toggle value={settings.smartAgent.dryRun} onChange={v => setAgent('dryRun', v)} />
        </Row>
        <Row label="Daily reply limit">
          <input
            type="number" value={settings.smartAgent.dailyReplyLimit} min={1} max={200}
            onInput={(e: any) => setAgent('dailyReplyLimit', Number(e.target.value))}
            style={{
              width: '64px', padding: '5px 8px', textAlign: 'center',
              background: 'var(--surface-hover)', border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-xs)', color: 'var(--text)', fontSize: '12px',
              fontWeight: 700, outline: 'none',
            }}
          />
        </Row>
        <Row label="Min price floor (€)">
          <input
            type="number" value={settings.smartAgent.minPriceFloor} min={0} step={0.5}
            onInput={(e: any) => setAgent('minPriceFloor', Number(e.target.value))}
            style={{
              width: '64px', padding: '5px 8px', textAlign: 'center',
              background: 'var(--surface-hover)', border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-xs)', color: 'var(--text)', fontSize: '12px',
              fontWeight: 700, outline: 'none',
            }}
          />
        </Row>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
          Personality prompt
        </div>
        <textarea
          value={settings.smartAgent.personalityPrompt}
          onInput={(e: any) => setAgent('personalityPrompt', e.target.value)}
          rows={3}
          style={{
            width: '100%', background: 'var(--surface-hover)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontSize: '11px',
            padding: '7px 10px', fontFamily: 'var(--font)', resize: 'vertical',
            outline: 'none', lineHeight: 1.5,
          }}
        />
        {settings.smartAgent.dryRun && (
          <div style={{
            fontSize: '11px', color: 'var(--warn)',
            background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)',
            borderRadius: 'var(--radius-sm)', padding: '7px 10px',
          }}>
            ⚠ Dry-run mode is ON — replies will be logged but not sent.
          </div>
        )}
        <button onClick={saveAgentSettings} style={primaryBtn(agentSaved)}>
          {agentSaved ? '✓ Saved' : 'Save Agent Settings'}
        </button>
      </Card>

      {/* ── Storage ── */}
      <Card title="💾 Local Storage">
        <Row label="Used">
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 700 }}>
            {bytesLabel}
          </span>
        </Row>
        <div style={{ marginTop: '4px' }}>
          <div style={{
            height: '4px', borderRadius: '999px',
            background: 'var(--surface-hover)', overflow: 'hidden',
          }}>
            {storageBytes !== null && (
              <div style={{
                height: '100%', borderRadius: '999px',
                width: `${Math.min(100, (storageBytes / (10 * 1024 * 1024)) * 100).toFixed(1)}%`,
                background: 'var(--accent)',
                transition: 'width 0.3s',
              }} />
            )}
          </div>
        </div>
        <button
          onClick={clearLogs}
          disabled={clearing}
          style={{ ...secondaryBtn(clearing), marginTop: '10px', color: 'var(--danger)' }}
        >
          {clearing ? 'Clearing…' : 'Clear offer & message logs'}
        </button>
      </Card>

      {/* ── About ── */}
      <Card title="ℹ About">
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--text-secondary)' }}>Vinted Auto</strong> — open-source dotZ successor.<br />
          No servers. No subscriptions. Everything runs in your browser.<br />
          <span style={{ color: 'var(--text-muted)' }}>v1.0 · dotZ reference: v3.28.0</span>
        </div>
      </Card>
    </div>
  )
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: any }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '14px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}>
      <div style={{
        fontSize: '11px', fontWeight: 800,
        color: 'var(--text-secondary)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: any }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{label}</span>
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

const primaryBtn = (active: boolean): any => ({
  flex: 1, padding: '7px 12px', borderRadius: 'var(--radius-sm)', border: 'none',
  cursor: active ? 'default' : 'pointer', fontWeight: 700, fontSize: '11px',
  background: active ? 'var(--success-dim)' : 'var(--accent-dim)',
  color: active ? 'var(--success)' : 'var(--accent)',
  transition: 'all 0.15s',
})

const secondaryBtn = (disabled: boolean): any => ({
  padding: '7px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)',
  cursor: disabled ? 'default' : 'pointer', fontWeight: 600, fontSize: '11px',
  background: 'transparent', color: 'var(--text-secondary)',
  opacity: disabled ? 0.5 : 1, transition: 'opacity 0.15s',
})
