/**
 * Plugin apply integration (d8 §4.1): mounts the REAL client plugin entry on
 * the dsh test-runtime (real Cordis + SlotRegistry + renderer), so declaration,
 * registration, service provision, locale registration, and disposal all run
 * through the production machinery. The locale plugin is mounted for real,
 * with the settings-scope/connection/remote/layout seams stubbed (ui-jobs
 * pattern). The dock now occupies the session-scoped 'details' column, so a
 * current session must exist for the entry to render.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { SlotTestRuntime, stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
// Merges the ui-layout SlotMap declaration so 'details' is a valid slot key
// (our own index.ts mirrors ui-sidebar's 'sidebar.footer.action' entry).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SidebarResult } from '../../src/contract/errors.ts'
import { apply as pluginApply, type BetterSidebarService } from '../../src/client/index.ts'

/** Wire seam the locale plugin and our plugin need (no real dsh web server). */
function fakeConnection(): { api: { settings: Record<string, never> }; isLoopback: boolean; rpc: { call: () => Promise<never> } } {
  return {
    api: { settings: {} },
    isLoopback: true,
    rpc: {
      call: async () => { throw new Error('unexpected RPC in apply test') },
    },
  }
}

async function bench(rpc?: { call: (...args: never[]) => Promise<unknown> }) {
  const rt = await SlotTestRuntime.create()
  // The details single slot and the sidebar footer action list, declared the
  // way the real AppFrame / SidebarRoot do.
  await rt.declare({
    'details': { kind: 'single', scope: 'session' },
    'sidebar.footer.action': { kind: 'list', scope: 'root' },
  })
  rt.provide('connection', { ...fakeConnection(), ...(rpc === undefined ? {} : { rpc }) } as never)
  rt.provide('remote', { $on: () => () => {} })
  rt.provide('settingsScope', { bind: () => stubSettingsScope().scope })
  const layout = { openDetails: vi.fn(), closeDetails: vi.fn(), toggleSidebar: vi.fn() }
  rt.provide('layout', layout)
  await rt.mount({ inject: localeInject, apply: applyLocale })
  const handle = await rt.mount({ inject: ['connection', 'slots', 'locale', 'layout'], apply: pluginApply })
  return { rt, handle, layout }
}

describe('client plugin apply', () => {
  it('provides ctx.betterSidebar, registers locales, and mounts the dock', async () => {
    const { rt, handle } = await bench()
    try {
      const service = (rt.ctx as unknown as { betterSidebar?: BetterSidebarService }).betterSidebar
      expect(service).toBeDefined()
      expect(service?.tabs.ids()).toEqual(['explorer', 'git'])
      expect(service?.tabs.active).toBe('explorer')

      // Strict session scope: the details occupant renders only with a
      // current session (the column is closed outside sessions by AppFrame).
      await rt.sessions.add({ id: 's1' })
      // renderSlot renders the root itself (autoRootView); an explicit
      // renderRoot() here would mount the tree twice (two docks, two toggle
      // listeners).
      const view = rt.renderSlot('details', {})
      expect(view.view.getByRole('region', { name: 'Right sidebar' })).toBeTruthy()
      expect(view.view.getByRole('tablist')).toBeTruthy()
      expect(view.view.getByRole('tab', { name: 'Explorer' })).toBeTruthy()
      expect(view.view.getByRole('tab', { name: 'Git' })).toBeTruthy()

      await handle.dispose()
      // Teardown collapses the registrations: the registry is empty again.
      expect(service?.tabs.ids()).toEqual([])
    } finally {
      await rt.dispose()
    }
  })

  it('registers the left-sidebar footer toggle and it flips the dock', async () => {
    const { rt, handle, layout } = await bench()
    try {
      await rt.sessions.add({ id: 's1' })
      const details = rt.renderSlot('details', {})
      expect(details.view.getByRole('region', { name: 'Right sidebar' })).toBeTruthy()

      // The footer action lives in the left sidebar (never overlaps content).
      const footer = rt.renderSlot('sidebar.footer.action', { wide: false })
      const toggle = footer.view.getByRole('button', { name: 'Toggle sidebar' })
      expect(toggle).toBeTruthy()

      // Clicking it dispatches the dock toggle: the open dock closes.
      fireEvent(toggle, new MouseEvent('click', { bubbles: true }))
      await rt.flush()
      expect(layout.closeDetails).toHaveBeenCalledTimes(1)
      expect(layout.openDetails).toHaveBeenCalledTimes(1) // mount seed only

      await handle.dispose()
    } finally {
      await rt.dispose()
    }
  })

  it('surfaces a typed rpc facade that tabs can call', async () => {
    const calls: unknown[] = []
    const { rt } = await bench({
      call: async (_channel: string, endpoint: string, payload: unknown) => {
        calls.push({ endpoint, payload })
        const value: SidebarResult<{ entries: [] }> = { ok: true, value: { entries: [] } }
        return { ok: true, value }
      },
    })
    try {
      const service = (rt.ctx as unknown as { betterSidebar?: BetterSidebarService }).betterSidebar
      const res = await service?.rpc.call('explorer/list', { path: '/tmp' })
      expect(res?.ok).toBe(true)
      expect(calls).toHaveLength(1)
    } finally {
      await rt.dispose()
    }
  })
})