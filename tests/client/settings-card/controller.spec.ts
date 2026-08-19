/**
 * Card controller tests (ADR-004 §3 amendment): staged writes, reset stages a
 * clear, discard drops drafts, invalid drafts block the save, and a failed
 * write keeps the drafts. The controller is framework-free over a fake scope.
 */
import { describe, expect, it } from 'vitest'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { BetterSidebarSettings } from '../../../src/contract/settings.ts'
import { SidebarSettingsCardController } from '../../../src/client/settings-card/controller.ts'

/** A controllable scope exposing writes and a revert-to-default on clear. */
function makeScope(initial: Partial<BetterSidebarSettings>) {
  // Defaults the resolved value falls back to when a field's user override is
  // cleared (mirrors the host schema defaults for the fields under test).
  const defaults: BetterSidebarSettings = {
    explorerPollMs: 8000,
    explorerDebounceMs: 600,
    gitPollMs: 8000,
    gitDebounceMs: 600,
    gitTimeoutMs: 15000,
    skillsPollMs: 100,
  }
  let resolved: BetterSidebarSettings = { ...defaults, ...initial }
  let user: Record<string, unknown> | undefined = Object.keys(initial).length ? { ...initial } : undefined
  const listeners = new Set<() => void>()
  let failNext = false
  const scope: SettingsScope<BetterSidebarSettings> = {
    getSnapshot: (): SettingsScopeSnapshot<BetterSidebarSettings> => {
      const snap: SettingsScopeSnapshot<BetterSidebarSettings> = {
        status: 'ready',
        value: resolved,
        base: defaults,
        user,
        revision: 0,
        writable: true,
        mode: 'host',
      }
      return snap
    },
    subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    set: async (field, v) => {
      if (failNext) { failNext = false; throw new Error('host rejected') }
      resolved = { ...resolved, [field]: v } as BetterSidebarSettings
      user = { ...user, [field]: v }
      emit()
    },
    unset: async (field) => {
      const next = { ...user }
      delete next[field]
      user = Object.keys(next).length ? next : undefined
      // Revert the resolved value to the served base/schema default.
      resolved = { ...resolved, [field]: defaults[field as keyof BetterSidebarSettings] }
      emit()
    },
  }
  function emit(): void { for (const l of Array.from(listeners)) l() }
  return { scope, setFailNext: () => { failNext = true } }
}

describe('SidebarSettingsCardController', () => {
  it('reports available/writable and fields for a ready scope', () => {
    const { scope } = makeScope({ explorerPollMs: 8000 })
    const controller = new SidebarSettingsCardController(scope)
    const state = controller.observable().getSnapshot()
    expect(state.available).toBe(true)
    expect(state.writable).toBe(true)
    expect(state.fields.explorerPollMs?.text).toBe('8000')
    expect(state.fields.explorerPollMs?.overridden).toBe(true)
  })

  it('stages an edit and writes it on save', async () => {
    const { scope } = makeScope({ explorerPollMs: 8000 })
    const controller = new SidebarSettingsCardController(scope)
    controller.actions().edit('explorerPollMs', '12000')
    expect(controller.observable().getSnapshot().dirty).toBe(true)
    const before = scope.getSnapshot()
    await controller.actions().save()
    // The scope wrote the new value.
    expect(scope.getSnapshot().value?.explorerPollMs).toBe(12000)
    void before
    // Draft cleared after a landed save.
    expect(controller.observable().getSnapshot().dirty).toBe(false)
  })

  it('stages a clear on reset so saving un-sets the field (reverts to default)', async () => {
    const { scope } = makeScope({ explorerPollMs: 12345 }) // an override that differs from the default
    const controller = new SidebarSettingsCardController(scope)
    controller.actions().resetField('explorerPollMs')
    await controller.actions().save()
    // The user override was cleared; the resolve falls back to the default.
    expect(scope.getSnapshot().value?.explorerPollMs).toBe(8000)
    // The user layer no longer carries it, so the card no longer marks it overridden.
    expect(controller.observable().getSnapshot().fields.explorerPollMs?.overridden).toBe(false)
    expect(controller.observable().getSnapshot().dirty).toBe(false)
  })

  it('discard drops staged edits without writing', async () => {
    const { scope } = makeScope({ explorerPollMs: 8000 })
    const controller = new SidebarSettingsCardController(scope)
    controller.actions().edit('explorerPollMs', '11111')
    expect(controller.observable().getSnapshot().dirty).toBe(true)
    controller.actions().discard()
    expect(controller.observable().getSnapshot().dirty).toBe(false)
    expect(scope.getSnapshot().value?.explorerPollMs).toBe(8000)
  })

  it('an invalid draft flags the card invalid and blocks the save', async () => {
    const { scope } = makeScope({ explorerPollMs: 8000 })
    const controller = new SidebarSettingsCardController(scope)
    controller.actions().edit('explorerPollMs', 'not-a-number')
    const state = controller.observable().getSnapshot()
    expect(state.fields.explorerPollMs?.invalid).toBe(true)
    expect(state.invalid).toBe(true)
    await controller.actions().save()
    // The write never ran; the scope value is unchanged.
    expect(scope.getSnapshot().value?.explorerPollMs).toBe(8000)
    expect(controller.observable().getSnapshot().dirty).toBe(true)
  })

  it('keeps the drafts when the Host rejects a save', async () => {
    const { scope, setFailNext } = makeScope({ explorerPollMs: 8000 })
    const controller = new SidebarSettingsCardController(scope)
    controller.actions().edit('explorerPollMs', '4444')
    setFailNext()
    await controller.actions().save()
    expect(controller.observable().getSnapshot().failed).toBe(true)
    // Drafts survive so the user can correct them.
    expect(controller.observable().getSnapshot().dirty).toBe(true)
  })
})
