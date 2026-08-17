import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkspaceListState, WorkspaceView, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { ExplorerListRequest, ExplorerListResult, ExplorerEntry, ExplorerStampRequest } from '../../../../src/contract/explorer.ts'
import type { SidebarResult } from '../../../../src/contract/errors.ts'
import type { BetterSidebarRpc } from '../../../../src/client/rpc-client.ts'
import { DockContext, type DockContextValue } from '../../../../src/client/dock/context.ts'
import { ExplorerPanel, AUTO_REFRESH_EXPLORER_DEBOUNCE_MS, AUTO_REFRESH_EXPLORER_INTERVAL_MS } from '../../../../src/client/tabs/explorer/ExplorerPanel.tsx'
import { en } from '../../../../src/client/tabs/explorer/locales.ts'
import { ExplorerOpenFileEmitter } from '../../../../src/client/tabs/explorer/events.ts'

afterEach(() => { cleanup() })

function fileEntry(path: string): ExplorerEntry {
  return { name: path.split('/').pop() ?? path, path, kind: 'file', hidden: false }
}

function dirEntry(path: string): ExplorerEntry {
  return { name: path.split('/').pop() ?? path, path, kind: 'directory', hidden: false }
}

function okResult(path: string, entries: ExplorerEntry[]): SidebarResult<ExplorerListResult> {
  return { ok: true, value: { path, entries, truncated: false } }
}

function notFound(path: string): SidebarResult<ExplorerListResult> {
  return { ok: false, error: { code: 'not-found', message: 'no such directory', path } }
}

const emptySessions: SessionListState = {
  ids: [], byId: {}, current: undefined, phase: 'pending',
  subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
}

function workspace(path: string): WorkspaceView {
  return {
    workspaceId: 'w' as unknown as WorkspaceId,
    path,
    title: path,
    sessionIds: [],
    createdAt: '',
    updatedAt: '',
  }
}

function singleWorkspace(path: string): WorkspaceListState {
  return {
    items: [workspace(path)],
    archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  }
}

const noWorkspaces: WorkspaceListState = {
  items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  baselinesReady: true, recentWorkspaceId: undefined,
}

function makeRpc(routes: Record<string, SidebarResult<ExplorerListResult>>, stamps?: () => Record<string, number | undefined>) {
  const calls: string[] = []
  const rpc = {
    call: async (endpoint: string, payload: unknown) => {
      if (endpoint === 'explorer/stamp') {
        const req = payload as ExplorerStampRequest
        return { ok: true, value: { path: req.path, stamps: stamps?.() ?? {} } }
      }
      if (endpoint !== 'explorer/list') throw new Error('unexpected endpoint: ' + endpoint)
      const path = (payload as ExplorerListRequest).path
      calls.push(path)
      return routes[path] ?? notFound(path)
    },
  } as unknown as BetterSidebarRpc
  return { rpc, calls }
}

interface RenderOptions {
  rpc: BetterSidebarRpc
  sessions?: SessionListState
  workspaces?: WorkspaceListState
}

function renderPanel({ rpc, sessions = emptySessions, workspaces = noWorkspaces }: RenderOptions) {
  const emitter = new ExplorerOpenFileEmitter()
  const listener = vi.fn()
  emitter.onOpenFile(listener)
  const dockValue: DockContextValue = {
    rpc,
    useSessions: ((sel) => sel(sessions)) as SnapshotSelectorHook<SessionListState>,
    useWorkspaces: ((sel) => sel(workspaces)) as SnapshotSelectorHook<WorkspaceListState>,
    settings: undefined,
  }
  render(
    <DockContext.Provider value={dockValue}>
      <ExplorerPanel rpc={rpc} emitter={emitter} t={(key) => en[key]} />
    </DockContext.Provider>,
  )
  return { emitter, listener }
}

describe('ExplorerPanel', () => {
  it('renders the no-workspace empty state when no root resolves', () => {
    const { rpc } = makeRpc({})
    renderPanel({ rpc })
    expect(screen.getByText('No workspace open')).toBeTruthy()
    expect(screen.queryByRole('tree')).toBeNull()
  })

  it('renders the loaded tree with tree/treeitem roles', async () => {
    const { rpc } = makeRpc({ '/r': okResult('/r', [dirEntry('/r/src'), fileEntry('/r/readme.md')]) })
    renderPanel({ rpc, workspaces: singleWorkspace('/r') })
    await screen.findByText('src')
    expect(screen.getByRole('tree')).toBeTruthy()
    expect(screen.getAllByRole('treeitem')).toHaveLength(2)
    const src = screen.getByRole('treeitem', { name: 'src' })
    expect(src.getAttribute('aria-expanded')).toBe('false')
    const file = screen.getByRole('treeitem', { name: 'readme.md' })
    expect(file.getAttribute('aria-expanded')).toBeNull()
  })

  it('expanding a directory lazily lists and reveals its children', async () => {
    const { rpc } = makeRpc({
      '/r': okResult('/r', [dirEntry('/r/src'), fileEntry('/r/a.js')]),
      '/r/src': okResult('/r/src', [fileEntry('/r/src/index.js'), dirEntry('/r/src/lib')]),
    })
    const user = userEvent.setup()
    renderPanel({ rpc, workspaces: singleWorkspace('/r') })
    const caret = await screen.findByRole('button', { name: en['expand'] })
    await user.click(caret)
    await screen.findByRole('treeitem', { name: 'index.js' })
    expect(screen.getByRole('treeitem', { name: 'src' }).getAttribute('aria-expanded')).toBe('true')
    // Collapsing hides the children again.
    await user.click(screen.getByRole('button', { name: en['collapse'] }))
    expect(screen.queryByRole('treeitem', { name: 'index.js' })).toBeNull()
  })

  it('renders a root error and retry reloads after the path is fixed', async () => {
    const routes: Record<string, SidebarResult<ExplorerListResult>> = { '/r': notFound('/r') }
    const { rpc } = makeRpc(routes)
    const user = userEvent.setup()
    renderPanel({ rpc, workspaces: singleWorkspace('/r') })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('The workspace directory no longer exists')
    // Fix the route; retry should load the tree.
    routes['/r'] = okResult('/r', [fileEntry('/r/ok.txt')])
    await user.click(screen.getByRole('button', { name: /retry/i }))
    await screen.findByRole('treeitem', { name: 'ok.txt' })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('the refresh button re-lists the current root', async () => {
    const routes: Record<string, SidebarResult<ExplorerListResult>> = { '/r': okResult('/r', [fileEntry('/r/old.txt')]) }
    const { rpc, calls } = makeRpc(routes)
    const user = userEvent.setup()
    renderPanel({ rpc, workspaces: singleWorkspace('/r') })
    await screen.findByRole('treeitem', { name: 'old.txt' })
    const before = calls.filter(p => p === '/r').length
    routes['/r'] = okResult('/r', [fileEntry('/r/new.txt')])
    const refreshButton = screen.getByRole('button', { name: 'Refresh' })
    await user.click(refreshButton)
    await screen.findByRole('treeitem', { name: 'new.txt' })
    expect(calls.filter(p => p === '/r').length).toBe(before + 1)
  })

  it('double-clicking a file row emits an open-file event', async () => {
    const { rpc } = makeRpc({ '/r': okResult('/r', [fileEntry('/r/a.js')]) })
    const user = userEvent.setup()
    const { listener } = renderPanel({ rpc, workspaces: singleWorkspace('/r') })
    const row = await screen.findByRole('treeitem', { name: 'a.js' })
    await user.dblClick(row)
    expect(listener).toHaveBeenCalledTimes(1)
    const event = listener.mock.calls[0]?.[0]
    expect(event).toMatchObject({ path: '/r/a.js', name: 'a.js', kind: 'file', source: 'double-click', rootPath: '/r' })
  })

  it('ArrowDown + Enter move focus and open a file via keyboard', async () => {
    const { rpc } = makeRpc({ '/r': okResult('/r', [fileEntry('/r/a.js'), fileEntry('/r/b.ts')]) })
    const user = userEvent.setup()
    const { listener } = renderPanel({ rpc, workspaces: singleWorkspace('/r') })
    const first = await screen.findByRole('treeitem', { name: 'a.js' })
    await user.click(first)
    await waitFor(() => expect(first.getAttribute('tabindex')).toBe('0'))
    await user.keyboard('{ArrowDown}')
    const second = screen.getByRole('treeitem', { name: 'b.ts' })
    await waitFor(() => expect(second.getAttribute('tabindex')).toBe('0'))
    expect(first.getAttribute('tabindex')).toBe('-1')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1))
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ path: '/r/b.ts', source: 'keyboard-enter' })
  })

  it('asterisk expands the focused node one level', async () => {
    const { rpc } = makeRpc({
      '/r': okResult('/r', [dirEntry('/r/src')]),
      '/r/src': okResult('/r/src', [dirEntry('/r/src/nested'), fileEntry('/r/src/app.js')]),
      '/r/src/nested': okResult('/r/src/nested', [fileEntry('/r/src/nested/deep.js')]),
    })
    const user = userEvent.setup()
    renderPanel({ rpc, workspaces: singleWorkspace('/r') })
    const src = await screen.findByRole('treeitem', { name: 'src' })
    await user.click(src)
    await user.keyboard('*')
    // src expands and reveals its children, including the nested dir expanded one level.
    await screen.findByRole('treeitem', { name: 'nested' })
    await screen.findByRole('treeitem', { name: 'deep.js' })
  })
})

/** A sessions snapshot with a current session whose cwd is the tree root. */
function activeSession(updatedAt: number): SessionListState {
  return {
    ids: ['s1'],
    byId: { s1: { id: 's1', displayTitle: 'S', cwd: '/r', running: false, blank: false, updatedAt } },
    current: 's1',
    phase: 'ready',
    subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
  } as unknown as SessionListState
}

describe('ExplorerPanel auto-refresh (ADR-004 §3 amendment)', () => {
  afterEach(() => { vi.useRealTimers() })

  const listCount = (calls: string[], p: string): number => calls.filter(c => c === p).length

  it('re-lists a directory whose stamp moved on the fallback poll', async () => {
    vi.useFakeTimers()
    const routes: Record<string, SidebarResult<ExplorerListResult>> = {
      '/r': okResult('/r', [dirEntry('/r/src')]),
      '/r/src': okResult('/r/src', [fileEntry('/r/src/index.js')]),
    }
    let stamps: Record<string, number | undefined> = { '/r': 1, '/r/src': 1 }
    const { rpc, calls } = makeRpc(routes, () => stamps)
    renderPanel({ rpc, workspaces: singleWorkspace('/r') })
    // Initial root load settles.
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole('treeitem', { name: 'src' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['expand'] }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole('treeitem', { name: 'index.js' })).toBeTruthy()
    const before = listCount(calls, '/r/src')

    // An external process adds a file under src: its directory stamp moves.
    routes['/r/src'] = okResult('/r/src', [fileEntry('/r/src/index.js'), fileEntry('/r/src/new.js')])
    stamps = { '/r': 1, '/r/src': 2 }

    await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_REFRESH_EXPLORER_INTERVAL_MS) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole('treeitem', { name: 'new.js' })).toBeTruthy()
    expect(listCount(calls, '/r/src')).toBe(before + 1)
  })

  it('auto-refreshes once, debounced, after the active session bumps updatedAt', async () => {
    vi.useFakeTimers()
    const routes: Record<string, SidebarResult<ExplorerListResult>> = {
      '/r': okResult('/r', [fileEntry('/r/a.js')]),
    }
    const { rpc, calls } = makeRpc(routes, () => ({ '/r': 1 }))
    const sessionsRef: { value: SessionListState } = { value: activeSession(0) }
    const dockValue: DockContextValue = {
      rpc,
      useSessions: ((sel) => sel(sessionsRef.value)) as SnapshotSelectorHook<SessionListState>,
      useWorkspaces: ((sel) => sel(singleWorkspace('/r'))) as SnapshotSelectorHook<WorkspaceListState>,
      settings: undefined,
    }
    // Fresh element per render: React bails out when the exact same element
    // reference is re-rendered, which would skip the dirty-signal effect.
    const tree = () => (
      <DockContext.Provider value={dockValue}>
        <ExplorerPanel rpc={rpc} emitter={new ExplorerOpenFileEmitter()} t={(key) => en[key]} />
      </DockContext.Provider>
    )
    const { rerender } = render(tree())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole('treeitem', { name: 'a.js' })).toBeTruthy()
    const before = listCount(calls, '/r')

    // A tool result lands: the session summary bumps its activity stamp.
    sessionsRef.value = activeSession(1)
    rerender(tree())
    // Debounce has not elapsed yet -> no refresh.
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_REFRESH_EXPLORER_DEBOUNCE_MS - 1) })
    expect(listCount(calls, '/r')).toBe(before)
    // Once the debounce elapses, exactly one silent refresh runs.
    routes['/r'] = okResult('/r', [fileEntry('/r/a.js'), fileEntry('/r/b.ts')])
    await act(async () => { await vi.advanceTimersByTimeAsync(2) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole('treeitem', { name: 'b.ts' })).toBeTruthy()
    expect(listCount(calls, '/r')).toBe(before + 1)
  })

  it('sends the loaded dirs and the root in the stamp sweep', async () => {
    vi.useFakeTimers()
    const stampRequests: ExplorerStampRequest[] = []
    const routes: Record<string, SidebarResult<ExplorerListResult>> = {
      '/r': okResult('/r', [dirEntry('/r/src')]),
      '/r/src': okResult('/r/src', [fileEntry('/r/src/index.js')]),
    }
    const rpc = {
      call: async (endpoint: string, payload: unknown) => {
        if (endpoint === 'explorer/stamp') {
          stampRequests.push(payload as ExplorerStampRequest)
          const req = payload as ExplorerStampRequest
          const stamps: Record<string, number | undefined> = {}
          for (const d of req.dirs) stamps[d] = 1
          return { ok: true, value: { path: req.path, stamps } }
        }
        if (endpoint !== 'explorer/list') throw new Error('unexpected endpoint: ' + endpoint)
        const path = (payload as ExplorerListRequest).path
        return routes[path] ?? notFound(path)
      },
    } as unknown as BetterSidebarRpc
    renderPanel({ rpc, workspaces: singleWorkspace('/r') })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole('treeitem', { name: 'src' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['expand'] }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_REFRESH_EXPLORER_INTERVAL_MS) })
    const sweep = stampRequests[0]
    expect(sweep).toBeTruthy()
    expect(sweep?.path).toBe('/r')
    expect(new Set(sweep?.dirs)).toEqual(new Set(['/r', '/r/src']))
  })
})