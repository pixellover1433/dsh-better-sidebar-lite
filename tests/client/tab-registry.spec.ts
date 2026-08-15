/**
 * Tab registry service unit tests (ADR-003, d8 §3). jsdom env provides
 * localStorage for persistence coverage.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { TabRegistryService } from '../../src/client/tab-registry/service.ts'
import { TabRegisterError } from '../../src/client/tab-registry/contract.ts'
import type { TabDef } from '../../src/client/tab-registry/contract.ts'

const ACTIVE_KEY = 'dsh.betterSidebar.activeTab'

function tab(id: string, order?: number): TabDef {
  const def: TabDef = { id, label: id, icon: null, renderPanel: () => null }
  if (order !== undefined) def.order = order
  return def
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('BetterSidebarTabRegistry', () => {
  it('orders by (order, registration index)', () => {
    const t = new TabRegistryService()
    t.register(tab('a', 20))
    t.register(tab('b', 10))
    t.register(tab('c'))            // no order -> sorts last
    t.register(tab('d', 10))        // tie with b -> later registration index
    expect([...t.ids()]).toEqual(['b', 'd', 'a', 'c'])
  })

  it('register returns an idempotent disposer', () => {
    const t = new TabRegistryService()
    const dispose = t.register(tab('a'))
    expect(t.get('a')).not.toBeUndefined()
    dispose()
    expect(t.get('a')).toBeUndefined()
    dispose() // second call is a no-op
    expect(t.get('a')).toBeUndefined()
  })

  it('unregister removes the tab', () => {
    const t = new TabRegistryService()
    t.register(tab('a'))
    t.unregister('a')
    expect(t.get('a')).toBeUndefined()
    expect([...t.ids()]).toEqual([])
    // unregistering an unknown id is a no-op
    t.unregister('missing')
  })

  it('register throws TabRegisterError on a duplicate id', () => {
    const t = new TabRegistryService()
    t.register(tab('a'))
    expect(() => t.register(tab('a'))).toThrow(TabRegisterError)
  })

  it('re-registering an id after disposal is allowed', () => {
    const t = new TabRegistryService()
    const dispose = t.register(tab('a'))
    dispose()
    expect(() => t.register(tab('a'))).not.toThrow()
  })

  it('activates the first remaining tab when none is selected', () => {
    const t = new TabRegistryService()
    t.register(tab('a', 10))
    t.register(tab('b', 20))
    expect(t.active).toBe('a')
  })

  it('select activates and returns true; unknown id returns false', () => {
    const t = new TabRegistryService()
    t.register(tab('a', 10))
    t.register(tab('b', 20))
    expect(t.select('b')).toBe(true)
    expect(t.active).toBe('b')
    expect(t.select('nope')).toBe(false)
    expect(t.active).toBe('b')
  })

  it('falls back to the first remaining tab when the active one is unregistered', () => {
    const t = new TabRegistryService()
    t.register(tab('a', 10))
    t.register(tab('b', 20))
    t.select('b')
    t.unregister('b')
    expect(t.active).toBe('a')
  })

  it('subscribe notifies on register/unregister/select', () => {
    const t = new TabRegistryService()
    let calls = 0
    const off = t.subscribe(() => { calls += 1 })
    t.register(tab('a'))
    t.select('a')
    t.unregister('a')
    off()
    const after = calls
    t.register(tab('b'))
    expect(after).toBeGreaterThanOrEqual(3)
    expect(t.get('b')).not.toBeUndefined()
  })

  it('persists the active tab to localStorage on select', () => {
    const t = new TabRegistryService()
    t.register(tab('a', 10))
    t.register(tab('b', 20))
    t.select('b')
    expect(localStorage.getItem(ACTIVE_KEY)).toBe('b')
  })

  it('restores a persisted active tab on a fresh registry', () => {
    localStorage.setItem(ACTIVE_KEY, 'b')
    const t = new TabRegistryService()
    t.register(tab('a', 10))
    t.register(tab('b', 20))
    expect(t.active).toBe('b')
  })

  it('tolerates a stale persisted id and falls back to the first remaining', () => {
    localStorage.setItem(ACTIVE_KEY, 'ghost')
    const t = new TabRegistryService()
    t.register(tab('a', 10))
    t.register(tab('b', 20))
    expect(t.active).toBe('a')
  })

  it('tolerates a corrupt persisted value', () => {
    localStorage.setItem(ACTIVE_KEY, '{not json at all')
    const t = new TabRegistryService()
    t.register(tab('a', 10))
    expect(t.active).toBe('a')
  })

  it('register persists the settled active tab', () => {
    const t = new TabRegistryService()
    t.register(tab('a', 10))
    expect(localStorage.getItem(ACTIVE_KEY)).toBe('a')
  })
})