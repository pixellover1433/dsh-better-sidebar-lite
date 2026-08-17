import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionListState, WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { BetterSidebarRpc } from '../../../../src/client/rpc-client.ts'
import { DockContext, type DockContextValue } from '../../../../src/client/dock/context.ts'
import { createExplorerTabDef } from '../../../../src/client/tabs/explorer/tab-def.ts'
import { ExplorerOpenFileEmitter } from '../../../../src/client/tabs/explorer/events.ts'
import { en } from '../../../../src/client/tabs/explorer/locales.ts'

function fakeContext(): ClientContext {
  const t = (key: keyof typeof en) => en[key]
  return {
    locale: { bind: () => (k: string) => t(k as keyof typeof en) },
  } as unknown as ClientContext
}

const emptySessions = {
  ids: [], byId: {}, current: undefined, phase: 'pending',
  subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
} as SessionListState

const noWorkspaces = {
  items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  baselinesReady: true, recentWorkspaceId: undefined,
} as WorkspaceListState

function noopRpc(): BetterSidebarRpc {
  return { call: async () => ({ ok: true as const, value: null }) } as unknown as BetterSidebarRpc
}

describe('createExplorerTabDef', () => {
  it('returns the expected TabDef shape', () => {
    const def = createExplorerTabDef(fakeContext(), {
      rpc: noopRpc(),
      emitter: new ExplorerOpenFileEmitter(),
    })
    expect(def.id).toBe('explorer')
    expect(def.order).toBe(10)
    expect(typeof def.label).toBe('function')
    expect((def.label as () => string)()).toBe(en.tabLabel)
    expect(def.icon).toBeTruthy()
    expect(typeof def.renderPanel).toBe('function')
  })

  it('renderPanel renders the explorer panel inside a dock provider', () => {
    const def = createExplorerTabDef(fakeContext(), {
      rpc: noopRpc(),
      emitter: new ExplorerOpenFileEmitter(),
    })
    const dockValue: DockContextValue = {
      rpc: noopRpc(),
      useSessions: ((sel) => sel(emptySessions)) as SnapshotSelectorHook<SessionListState>,
      useWorkspaces: ((sel) => sel(noWorkspaces)) as SnapshotSelectorHook<WorkspaceListState>,
      settings: undefined,
    }
    render(<DockContext.Provider value={dockValue}>{def.renderPanel()}</DockContext.Provider>)
    expect(screen.getByRole('region', { name: 'Explorer' })).toBeTruthy()
    expect(screen.getByText('No workspace open')).toBeTruthy()
  })
})