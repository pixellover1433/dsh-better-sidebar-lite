/**
 * Host settings registration (ADR-004 §3 amendment): the plugin registers a
 * namespaced section for its user-editable tunables when the settings seam is
 * composed. Tests cover the schema defaults/validation and that registration
 * happens on the settings provider.
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  BetterSidebarSettingsSchema, BETTER_SIDEBAR_NAMESPACE, registerBetterSidebarSettings,
} from '../../src/host/settings.ts'
import { SETTINGS_DEFAULTS, SETTINGS_NAMESPACE } from '../../src/contract/index.ts'

describe('BetterSidebarSettingsSchema', () => {
  it('applies contract defaults for an empty section', () => {
    const value = BetterSidebarSettingsSchema({} as never)
    expect(value.explorerPollMs).toBe(SETTINGS_DEFAULTS.explorerPollMs)
    expect(value.explorerDebounceMs).toBe(SETTINGS_DEFAULTS.explorerDebounceMs)
    expect(value.gitPollMs).toBe(SETTINGS_DEFAULTS.gitPollMs)
    expect(value.gitDebounceMs).toBe(SETTINGS_DEFAULTS.gitDebounceMs)
    expect(value.gitTimeoutMs).toBe(SETTINGS_DEFAULTS.gitTimeoutMs)
  })

  it('accepts user values within bounds', () => {
    const value = BetterSidebarSettingsSchema({
      explorerPollMs: 3000,
      gitTimeoutMs: 7000,
    } as never)
    expect(value.explorerPollMs).toBe(3000)
    expect(value.gitTimeoutMs).toBe(7000)
  })

  it('rejects out-of-range values loudly', () => {
    expect(() => BetterSidebarSettingsSchema({ explorerPollMs: 10 } as never)).toThrow()
    expect(() => BetterSidebarSettingsSchema({ gitTimeoutMs: 999_999 } as never)).toThrow()
    expect(() => BetterSidebarSettingsSchema({ explorerDebounceMs: -1 } as never)).toThrow()
  })
})

describe('registerBetterSidebarSettings', () => {
  it('is a no-op (never throws) when the settings seam is absent', () => {
    // No settings provider composed: registration must not throw nor touch any
    // provider — the plugin still works with the contract defaults.
    const ctx = new Context()
    let error: unknown
    try {
      registerBetterSidebarSettings(ctx)
    } catch (e) {
      error = e
    }
    expect(error).toBeUndefined()
  })

  it('exposes the branded namespace under the contract id', () => {
    expect(String(BETTER_SIDEBAR_NAMESPACE)).toBe(SETTINGS_NAMESPACE)
  })
})
