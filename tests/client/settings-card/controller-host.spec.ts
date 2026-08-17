/**
 * Host-faithful save test: drives the card controller against a scope that
 * faithfully mimics dsh's `SettingsScopeController` wire behavior â€” every
 * `set`/`unset` is a revision-fenced path-op mutate that returns the FULL
 * resolved section (schema defaults filled for absent fields), and the
 * snapshot value updates only when the host accepts the write. This reproduces
 * the real host round-trip so a "value resets to default after save"
 * regression is caught, and so an out-of-range value is never sent to the host
 * and never silently reverts.
 */
import { describe, expect, it } from 'vitest'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { BetterSidebarSettings } from '../../../src/contract/settings.ts'
import { SETTINGS_DEFAULTS, SETTING_RANGES } from '../../../src/contract/settings.ts'
import { SidebarSettingsCardController } from '../../../src/client/settings-card/controller.ts'

/** Faithful SettingsScopeController stand-in (path-op writes, full resolution). */
function hostFaithfulScope(): { scope: SettingsScope<BetterSidebarSettings>; current: () => Record<string, unknown> } {
  const defaults: Record<string, unknown> = { ...SETTINGS_DEFAULTS }
  let user: Record<string, unknown> = {}
  let revision = 0

  const resolve = () => {
    const value: Record<string, unknown> = {}
    for (const [k, d] of Object.entries(defaults)) {
      value[k] = Object.hasOwn(user, k) ? user[k] : d
    }
    return { value, base: { ...defaults }, user: { ...user }, revision }
  }

  const listeners = new Set<() => void>()
  let snap = resolve()

  const scope: SettingsScope<BetterSidebarSettings> = {
    getSnapshot: () => ({ status: 'ready' as const, value: snap.value as unknown as BetterSidebarSettings | undefined, base: snap.base, user: snap.user, revision: snap.revision, writable: true as const, mode: 'host' as const }),
    subscribe: (fn: () => void): (() => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    set: async (field: string, value: unknown): Promise<void> => {
      user = { ...user, [field]: value }
      revision += 1
      snap = resolve()
      for (const l of Array.from(listeners)) l()
    },
    unset: async (field: string): Promise<void> => {
      const next = { ...user }
      delete next[field]
      user = next
      revision += 1
      snap = resolve()
      for (const l of Array.from(listeners)) l()
    },
  }

  return { scope, current: () => snap.value }
}

describe('SidebarSettingsCardController save (host-faithful)', () => {
  it('persists edited poll values instead of reverting to the default', async () => {
    const { scope, current } = hostFaithfulScope()
    const controller = new SidebarSettingsCardController(scope)

    controller.actions().edit('explorerPollMs', '12000')
    controller.actions().edit('gitPollMs', '20000')
    await controller.actions().save()
    // Flush trailing microtasks (the settings scope notifies subscribers
    // synchronously during the write) before reading the settled card state.
    await new Promise(resolve => setTimeout(resolve, 0))

    const value = current() as unknown as BetterSidebarSettings
    expect(value.explorerPollMs).toBe(12000)
    expect(value.gitPollMs).toBe(20000)
    expect(value.explorerDebounceMs).toBe(SETTINGS_DEFAULTS.explorerDebounceMs)
    const state = controller.observable().getSnapshot()
    expect(state.dirty).toBe(false)
    expect(state.failed).toBe(false)
    expect(state.saving).toBe(false)
    expect(state.fields.explorerPollMs?.text).toBe('12000')
    expect(state.fields.gitPollMs?.text).toBe('20000')
  })

  it('persists a single edited field without touching the others', async () => {
    const { scope, current } = hostFaithfulScope()
    const controller = new SidebarSettingsCardController(scope)
    controller.actions().edit('explorerPollMs', '9000')
    await controller.actions().save()
    const value = current() as unknown as BetterSidebarSettings
    expect(value.explorerPollMs).toBe(9000)
    expect(value.explorerDebounceMs).toBe(SETTINGS_DEFAULTS.explorerDebounceMs)
  })

  it('marks a value below the field range invalid and never sends it to the host', async () => {
    const { scope, current } = hostFaithfulScope()
    const controller = new SidebarSettingsCardController(scope)
    const belowMin = SETTING_RANGES.explorerPollMs.min - 1
    controller.actions().edit('explorerPollMs', String(belowMin))
    expect(controller.observable().getSnapshot().invalid).toBe(true)
    expect(controller.observable().getSnapshot().fields.explorerPollMs?.invalid).toBe(true)
    await controller.actions().save()
    // The host never received it: the resolved value stays the default.
    expect((current() as unknown as BetterSidebarSettings).explorerPollMs).toBe(SETTINGS_DEFAULTS.explorerPollMs)
    // The draft survives (the card does not silently revert to default).
    expect(controller.observable().getSnapshot().fields.explorerPollMs?.text).toBe(String(belowMin))
  })

  it('allows a small poll within the range', async () => {
    const { scope, current } = hostFaithfulScope()
    const controller = new SidebarSettingsCardController(scope)
    controller.actions().edit('explorerPollMs', '100')
    expect(controller.observable().getSnapshot().fields.explorerPollMs?.invalid).toBe(false)
    await controller.actions().save()
    expect((current() as unknown as BetterSidebarSettings).explorerPollMs).toBe(100)
    expect(controller.observable().getSnapshot().dirty).toBe(false)
  })
})
