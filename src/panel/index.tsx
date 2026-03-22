import '@/lib/chrome-mock'
import { render } from 'preact'
import { useState } from 'preact/hooks'
import { Dashboard } from './Dashboard'
import { Log } from './Log'
import { Sidebar } from './Sidebar'
import { Inbox } from './sections/Inbox'
import { Catalog } from './sections/Catalog'
import { Orders } from './sections/Orders'
import { Export } from './sections/Export'
import { Settings } from './sections/Settings'
import '../styles/tokens.css'

export type Section = 'dashboard' | 'inbox' | 'catalog' | 'orders' | 'export' | 'log' | 'settings'

const SECTION_TITLES: Record<Section, string> = {
  dashboard: '⚡ Live',
  inbox:     '💬 Inbox',
  catalog:   '📦 Catalog',
  orders:    '📋 Orders',
  export:    '⬇ Export',
  log:       '📜 Activity Log',
  settings:  '⚙ Settings',
}

export function App() {
  const [section, setSection] = useState<Section>('dashboard')

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: 'var(--bg)',
      fontFamily: 'var(--font)',
      color: 'var(--text)',
      overflow: 'hidden',
    }}>
      <Sidebar active={section} onSelect={setSection} />

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Section header */}
        <div style={{
          padding: '12px 14px 10px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span style={{ fontWeight: 800, fontSize: '13px' }}>
            {SECTION_TITLES[section]}
          </span>
          <span style={{
            fontSize: '9px', fontWeight: 700,
            color: 'var(--text-muted)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            padding: '2px 7px',
            borderRadius: '999px',
            letterSpacing: '0.04em',
          }}>
            v1.0
          </span>
        </div>

        {/* Section content */}
        <div style={{ flex: 1, overflow: 'hidden', padding: '12px 14px 14px' }}>
          {section === 'dashboard' && <Dashboard />}
          {section === 'inbox'     && <Inbox />}
          {section === 'catalog'   && <Catalog />}
          {section === 'orders'    && <Orders />}
          {section === 'export'    && <Export />}
          {section === 'log'       && <Log />}
          {section === 'settings'  && <Settings />}
        </div>
      </div>
    </div>
  )
}

render(<App />, document.getElementById('root')!)
