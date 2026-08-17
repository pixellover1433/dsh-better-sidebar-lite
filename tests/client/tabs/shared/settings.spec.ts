/**
 * Settings hook + contract defaults tests. The hook is a thin reactive selector
 * over a bound scope; a fake scope drives it (status ready/unavailable, value
 * changes, writes). The key invariant under test: the hook returns a stable
 * reference until a value actually changes, so tabs re-render on real edits but
 * never loop on identity churn.
 */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type {
  SettingsScope, SettingsScopeSnapshot,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { BetterSidebarSettings } from '../../../../src/contract/settings.ts'
import { SETTINGS_DEFAULTS } from '../../../../src/contract/settings.ts'
import { resolveSettings, useBetterSidebarSettings } from '../../../../src/client/tabs/shared/settings.ts'

/** A controllable settings scope double (stable snapshot until a write). */
function fakeScope(initial: Partial<BetterSidebarSettings> | undefined, status: 'ready' | 'unavailable' = 'ready') {
  let value: Partial<BetterSidebarSettings> | undefined = initial
  const listeners = new Set<() => void>()
  let revision = 0
  // The real scope returns a stable snapshot object until a write; mirror that
  // so useSyncExternalStore never sees identity churn between renders.
  let snapshot: SettingsScopeSnapshot<BetterSidebarSettings> = build()
  function build(): SettingsScopeSnapshot<BetterSidebarSettings> {
    return {
      status,
      value: value as BetterSidebarSettings | undefined,
      base: undefined,
      user: undefined,
      revision,
      writable: status === 'ready',
      mode: 'host',
    }
  }
  const scope: SettingsScope<BetterSidebarSettings> = {
    getSnapshot: () => snapshot,
    subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    set: async (field, v) => { value = { ...value, [field]: v }; revision += 1; snapshot = build(); for (const l of Array.from(listeners)) l() },
    unset: async (field) => { if (value !== undefined) { const copy: Record<string, unknown> = { ...value }; delete copy[field]; value = copy as Partial<BetterSidebarSettings>; revision += 1; snapshot = build(); for (const l of Array.from(listeners)) l() } },
  }
  return scope
}

describe('resolveSettings', () => {
  it('fills contract defaults for a partial/absent section', () => {
    expect(resolveSettings({ value: undefined })).toEqual(SETTINGS_DEFAULTS)
    expect(resolveSettings({ value: { explorerPollMs: 5000 } }).explorerPollMs).toBe(5000)
    expect(resolveSettings({ value: { explorerPollMs: 5000 } }).gitPollMs).toBe(SETTINGS_DEFAULTS.gitPollMs)
  })
})

describe('useBetterSidebarSettings', () => {
  it('returns defaults when the scope is absent', () => {
    const { result } = renderHook(() => useBetterSidebarSettings(undefined))
    expect(result.current).toEqual(SETTINGS_DEFAULTS)
  })

  it('returns the served section values', () => {
    const scope = fakeScope({ explorerPollMs: 9000, gitDebounceMs: 400 })
    const { result } = renderHook(() => useBetterSidebarSettings(scope))
    expect(result.current.explorerPollMs).toBe(9000)
    expect(result.current.gitDebounceMs).toBe(400)
    expect(result.current.explorerDebounceMs).toBe(SETTINGS_DEFAULTS.explorerDebounceMs)
  })

  it('is referentially stable until a value changes', () => {
    const scope = fakeScope({})
    const { result, rerender } = renderHook(() => useBetterSidebarSettings(scope))
    const first = result.current
    rerender()
    // Multiple renders return the SAME reference (no identity churn => no loop).
    expect(result.current).toBe(first)
  })

  it('re-renders a new reference after a live edit', async () => {
    const scope = fakeScope({ explorerPollMs: 1000 })
    const { result } = renderHook(() => useBetterSidebarSettings(scope))
    const before = result.current
    await act(async () => { await scope.set('explorerPollMs', 42_000) })
    expect(result.current).not.toBe(before)
    expect(result.current.explorerPollMs).toBe(42_000)
  })

  it('notifies subscribers on scope change', async () => {
    const scope = fakeScope({})
    const listener = vi.fn()
    const unsub = scope.subscribe(listener)
    await scope.set('gitPollMs', 5000)
    expect(listener).toHaveBeenCalledTimes(1)
    unsub()
    await scope.set('gitPollMs', 6000)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
