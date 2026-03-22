import { useState, useEffect } from 'preact/hooks'
import { localStore } from '@/storage'
import type { OfferLogEntry, MessageLogEntry } from '@/lib/types'

type LogEntry = { ts: number; text: string; color: string }

function fmt(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function Log() {
  const [entries, setEntries] = useState<LogEntry[]>([])

  const load = async () => {
    const [offers, messages] = await Promise.all([
      localStore.getOfferLog(),
      localStore.getMessageLog(),
    ])

    const offerEntries: LogEntry[] = offers.map((e: OfferLogEntry) => ({
      ts: e.sentAt,
      text: e.action === 'accepted'
        ? `✅ Accepted €${e.offerAmount.toFixed(2)} on "${e.itemTitle}"`
        : e.action === 'countered'
        ? `↩ Countered "${e.itemTitle}" → €${e.counterAmount?.toFixed(2)} (was €${e.offerAmount.toFixed(2)})`
        : `⏭ Skipped "${e.itemTitle}"`,
      color: e.action === 'accepted' ? '#4ade80' : e.action === 'countered' ? '#22d3ee' : '#475569',
    }))

    const msgEntries: LogEntry[] = messages.map((e: MessageLogEntry) => ({
      ts: e.sentAt,
      text: `💬 Message sent (${e.reason})`,
      color: '#a78bfa',
    }))

    const sorted = [...offerEntries, ...msgEntries].sort((a, b) => b.ts - a.ts).slice(0, 100)
    setEntries(sorted)
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {entries.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center', marginTop: '32px' }}>
          No activity yet.<br />
          <span style={{ fontSize: '11px' }}>Start automation and activity will appear here.</span>
        </div>
      ) : entries.map((e, i) => (
        <div key={i} style={{
          display: 'flex', gap: '8px', alignItems: 'flex-start',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '8px 10px',
        }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', marginTop: '1px', fontFamily: 'var(--font-mono)' }}>{fmt(e.ts)}</span>
          <span style={{ fontSize: '11px', color: e.color, lineHeight: 1.4 }}>{e.text}</span>
        </div>
      ))}
    </div>
  )
}
