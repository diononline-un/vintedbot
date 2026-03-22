import { useState, useEffect } from 'preact/hooks'
import { localStore } from '@/storage'

// Watches the DOM for conversation threads and attaches a note icon to each
export function InboxNoteOverlay() {
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  // Load all notes on mount
  useEffect(() => {
    chrome.storage.local.get('inboxNotes', (data) => {
      const raw: Record<string, any> = data.inboxNotes ?? {}
      const flat: Record<string, string> = {}
      for (const [k, v] of Object.entries(raw)) flat[k] = v.text
      setNotes(flat)
    })
  }, [])

  const save = async () => {
    if (!activeConvId) return
    await localStore.saveNote({ conversationId: activeConvId, text: draft, updatedAt: Date.now() })
    setNotes(n => ({ ...n, [activeConvId]: draft }))
    setActiveConvId(null)
  }

  const open = (id: string) => {
    setActiveConvId(id)
    setDraft(notes[id] ?? '')
  }

  if (!activeConvId) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2147483646,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        background: 'rgba(15,15,25,0.92)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '14px',
        padding: '20px',
        width: '320px',
        display: 'flex', flexDirection: 'column', gap: '12px',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>
          📝 Note for conversation
        </div>
        <textarea
          value={draft}
          onInput={(e: any) => setDraft(e.target.value)}
          placeholder="Add a private note…"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: '#f1f5f9',
            fontSize: '12px',
            padding: '10px',
            resize: 'vertical',
            minHeight: '80px',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={save} style={btnStyle('#22d3ee', '#0a0a0f')}>Save</button>
          <button onClick={() => setActiveConvId(null)} style={btnStyle('rgba(255,255,255,0.08)', '#94a3b8')}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function btnStyle(bg: string, color: string) {
  return {
    flex: 1, padding: '8px', borderRadius: '8px', border: 'none',
    background: bg, color, fontWeight: 700, fontSize: '12px', cursor: 'pointer',
  }
}
