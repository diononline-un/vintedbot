import { useState } from 'preact/hooks'
import { sessionStore } from '@/storage'

const S: Record<string, any> = {
  btn: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(15,15,25,0.75)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    zIndex: 2147483647,
    transition: 'transform 0.15s ease, background 0.15s ease',
    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
  },
  dot: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    border: '1.5px solid rgba(15,15,25,0.9)',
  },
}

export function FloatingButton() {
  const [running, setRunning] = useState(false)

  // Poll running state every 3s
  setInterval(async () => {
    const r = await sessionStore.isRunning()
    setRunning(r)
  }, 3000)

  const open = () => chrome.runtime.sendMessage({ action: 'openSidePanel' })

  return (
    <button
      style={S.btn}
      onClick={open}
      title="Vinted Auto"
    >
      ⚡
      <span style={{ ...S.dot, background: running ? '#4ade80' : '#475569' }} />
    </button>
  )
}
