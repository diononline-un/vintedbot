import { useState, useEffect } from 'preact/hooks'
import { getLiveStats, syncStorage } from '@/storage'
import type { AutoStats } from '@/lib/types'

export function Dashboard() {
  const [stats, setStats] = useState<AutoStats>({
    offersSentToday: 0, acceptedToday: 0, messagesSentToday: 0,
    lastPollAt: null, running: false,
  })
  const [enabled, setEnabled] = useState(false)
  const [toggling, setToggling] = useState(false)

  const refresh = async () => {
    const [s, settings] = await Promise.all([getLiveStats(), syncStorage.getSettings()])
    setStats(s)
    setEnabled(settings.automationEnabled)
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [])

  const toggle = async () => {
    setToggling(true)
    const next = !enabled
    await syncStorage.setEnabled(next)
    setEnabled(next)
    setToggling(false)
  }

  const lastPoll = stats.lastPollAt
    ? `${Math.round((Date.now() - stats.lastPollAt) / 1000)}s ago`
    : 'never'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>

      {/* Status card */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Automation</div>
            <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '2px', color: enabled ? 'var(--accent)' : 'var(--text-muted)' }}>
              {enabled ? (stats.running ? '● Running' : '◌ Starting…') : '○ Paused'}
            </div>
          </div>
          <button onClick={toggle} disabled={toggling} style={toggleBtn(enabled)}>
            {enabled ? 'Stop' : 'Start'}
          </button>
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px' }}>
          Last poll: {lastPoll}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <StatCard value={stats.offersSentToday} label="Countered" color="var(--accent)" />
        <StatCard value={stats.acceptedToday} label="Accepted" color="var(--success)" />
        <StatCard value={stats.messagesSentToday} label="Messages" color="var(--purple)" />
      </div>

      {/* Info */}
      <div style={{ ...card, fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text-secondary)' }}>How it works</strong><br />
        Polls your Vinted inbox every minute. Incoming offers are countered, auto-accepted, or get a fallback message — based on your Rules.
      </div>
    </div>
  )
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ ...card, flex: 1, textAlign: 'center', padding: '12px 8px' }}>
      <div style={{ fontSize: '22px', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    </div>
  )
}

function toggleBtn(active: boolean) {
  return {
    padding: '7px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
    fontWeight: 700, fontSize: '12px',
    background: active ? 'rgba(248,113,113,0.15)' : 'var(--accent-dim)',
    color: active ? 'var(--danger)' : 'var(--accent)',
    transition: 'all 0.15s ease',
  }
}

const card: any = {
  background: 'var(--surface)',
  backdropFilter: 'var(--blur)',
  WebkitBackdropFilter: 'var(--blur)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '14px',
}
