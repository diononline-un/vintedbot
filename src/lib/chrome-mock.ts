/**
 * Minimal chrome.storage mock for browser preview/dev mode.
 * Only active when chrome.storage is unavailable (outside extension context).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

if (typeof chrome === 'undefined' || !(chrome as any).storage) {
  function makeArea(seed: Record<string, unknown> = {}) {
    const store = { ...seed }
    return {
      get(keys?: any) {
        return new Promise<Record<string, unknown>>(resolve => {
          if (keys == null) return resolve({ ...store })
          const ks: string[] = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys)
          const out: Record<string, unknown> = {}
          for (const k of ks) if (k in store) out[k] = store[k]
          resolve(out)
        })
      },
      set(items: Record<string, unknown>) {
        return new Promise<void>(resolve => { Object.assign(store, items); resolve() })
      },
      remove(keys: string | string[]) {
        return new Promise<void>(resolve => {
          for (const k of ([] as string[]).concat(keys)) delete store[k]
          resolve()
        })
      },
      clear() { return new Promise<void>(resolve => { for (const k of Object.keys(store)) delete store[k]; resolve() }) },
      getBytesInUse: () => Promise.resolve(0),
      setAccessLevel: () => Promise.resolve(),
      onChanged: { addListener() {}, removeListener() {}, hasListener: () => false, hasListeners: () => false, addRules() {}, getRules() {}, removeRules() {} },
      QUOTA_BYTES: 10_485_760,
      QUOTA_BYTES_PER_ITEM: 8192,
      MAX_ITEMS: 512,
      MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE: 1_000_000,
      MAX_WRITE_OPERATIONS_PER_HOUR: 1_800,
      MAX_WRITE_OPERATIONS_PER_MINUTE: 120,
    }
  }

  const noop = () => {}
  const event = { addListener: noop, removeListener: noop, hasListener: () => false, hasListeners: () => false, addRules: noop, getRules: noop, removeRules: noop }

  ;(globalThis as any).chrome = {
    storage: {
      sync: makeArea(),
      local: makeArea(),
      session: makeArea(),
      onChanged: event,
    },
    runtime: {
      id: 'dev-mock',
      sendMessage: () => Promise.resolve(),
      onMessage: event,
    },
    action: { onClicked: event },
    tabs: {
      query: () => Promise.resolve([]),
      create: () => Promise.resolve({ id: 1, index: 0, pinned: false, highlighted: false, windowId: 1, active: true, incognito: false, selected: false, discarded: false, autoDiscardable: true }),
    },
    alarms: {
      create: noop,
      onAlarm: event,
    },
    sidePanel: {
      open: () => Promise.resolve(),
      close: () => Promise.resolve(),
      getOptions: () => Promise.resolve({}),
      setOptions: () => Promise.resolve(),
      getLayout: () => Promise.resolve({}),
      setLayout: () => Promise.resolve(),
      getPanelBehavior: () => Promise.resolve({}),
      setPanelBehavior: () => Promise.resolve(),
    },
  }

  console.info('[vinted-auto] chrome mock active — running outside extension context')
}
