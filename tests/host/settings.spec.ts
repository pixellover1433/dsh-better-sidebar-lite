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
  BetterSidebarSettingsSchema,
  BETTER_SIDEBAR_NAMESPACE,
  registerBetterSidebarSettings,
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

describe('rc.7 settings-card exposure (no self-expose needed)', () => {
  it('serves the registered namespace so the Plugins tab can dispatch its card', async () => {
    // dsh v0.1.0-rc.7 serves EVERY registered settings namespace through
    // settings.describe — the Plugins configuration tab pairs a browser card
    // with a served namespace by key. Registering the namespace is therefore
    // the complete host half; no registerConfigurableProviders self-exposure
    // (the pre-rc.7 seam) is used anymore.
    const ctx = new Context()
    const served: string[] = []
    ctx.provide('settings', {
      register: (_ns: unknown, _schema: unknown) => {
        served.push(String(BETTER_SIDEBAR_NAMESPACE))
        return { get: () => undefined, watch: () => () => {} }
      },
    } as never)
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
    await vi.waitFor(() => expect(served).toContain(SETTINGS_NAMESPACE))
    expect(served).toEqual([SETTINGS_NAMESPACE])
  })

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
})
