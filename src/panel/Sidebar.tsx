import type { Section } from './index'

interface NavItem {
  id: Section
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Live',     icon: '⚡' },
  { id: 'inbox',     label: 'Inbox',    icon: '💬' },
  { id: 'catalog',   label: 'Catalog',  icon: '📦' },
  { id: 'orders',    label: 'Orders',   icon: '📋' },
  { id: 'export',    label: 'Export',   icon: '⬇' },
  { id: 'log',       label: 'Log',      icon: '📜' },
]

const SETTINGS_ITEM: NavItem = { id: 'settings', label: 'Settings', icon: '⚙' }

interface SidebarProps {
  active: Section
  onSelect: (s: Section) => void
}

export function Sidebar({ active, onSelect }: SidebarProps) {
  return (
    <div style={{
      width: '64px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      background: 'rgba(255,255,255,0.03)',
      borderRight: '1px solid var(--border)',
      paddingTop: '12px',
      paddingBottom: '8px',
      flexShrink: 0,
    }}>
      {/* Logo mark */}
      <div style={{
        width: '32px', height: '32px',
        background: 'var(--accent-dim)',
        border: '1px solid var(--accent)',
        borderRadius: '10px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '16px', marginBottom: '16px',
      }}>
        ⚡
      </div>

      {/* Main nav */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', padding: '0 6px' }}>
        {NAV_ITEMS.map(item => (
          <NavButton key={item.id} item={item} active={active === item.id} onClick={() => onSelect(item.id)} />
        ))}
      </div>

      {/* Settings pinned to bottom */}
      <div style={{ marginTop: 'auto', width: '100%', padding: '0 6px' }}>
        <NavButton item={SETTINGS_ITEM} active={active === 'settings'} onClick={() => onSelect('settings')} />
      </div>
    </div>
  )
}

function NavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={item.label}
      style={{
        width: '100%',
        padding: '8px 0 6px',
        borderRadius: '10px',
        border: 'none',
        background: active ? 'var(--surface-active)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '3px',
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      <span style={{ fontSize: '16px', lineHeight: 1 }}>{item.icon}</span>
      <span style={{
        fontSize: '9px',
        fontWeight: active ? 700 : 500,
        letterSpacing: '0.02em',
        lineHeight: 1,
      }}>
        {item.label}
      </span>
    </button>
  )
}
