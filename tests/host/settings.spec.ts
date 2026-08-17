/**
 * Host settings registration (ADR-004 §3 amendment): the plugin registers a
 * namespaced section for its user-editable tunables when the settings seam is
 * composed. Tests cover the schema defaults/validation and that registration
 * happens on the settings provider.
 */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { apply } from '../../src/host/index.ts'
import type { ConnectionRpcHandler, HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import {
  BETTER_SIDEBAR_PROVIDER,
  BETTER_SIDEBAR_PROVIDER_NAME,
  BetterSidebarSettingsSchema,
  BETTER_SIDEBAR_NAMESPACE,
  registerBetterSidebarSettings,
  selfExposeBetterSidebarSettings,
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

describe('selfExposeBetterSidebarSettings', () => {
  it('registers the plugin as a configurable provider when apply composes llm + connection', async () => {
    const ctx = new Context()
    const registered: unknown[] = []
    const llm = {
      registerConfigurableProviders: (entries: unknown) => {
        registered.push(entries)
        return () => {} // disposer
      },
    }
    ctx.provide('llm', llm as never)
    const captured: { handler?: ConnectionRpcHandler } = {}
    const connection = {
      rpc: {
        handle: (_channel: string, handler: ConnectionRpcHandler) => {
          captured.handler = handler
          return async () => { delete captured.handler }
        },
      },
    } as unknown as HostConnectionHandle
    ctx.provide('connection', connection)

    apply(ctx, {})
    // The llm-injected effect settles asynchronously (Cordis inject pipeline).
    await vi.waitFor(() => expect(registered).toHaveLength(1))
    const entry = (registered[0] as [{
      provider: string; displayName: string; settingsNs: string; settingsPath: string[]
    }])[0]
    expect(entry.provider).toBe(BETTER_SIDEBAR_PROVIDER)
    expect(entry.displayName).toBe(BETTER_SIDEBAR_PROVIDER_NAME)
    expect(entry.settingsNs).toBe(SETTINGS_NAMESPACE)
    expect(entry.settingsPath).toEqual([])
  })

  it('is a no-op (never throws) when the llm seam is absent', () => {
    // No llm provider composed: self-exposure must not throw.
    const ctx = new Context()
    let error: unknown
    try {
      selfExposeBetterSidebarSettings(ctx)
    } catch (e) {
      error = e
    }
    expect(error).toBeUndefined()
  })
})
