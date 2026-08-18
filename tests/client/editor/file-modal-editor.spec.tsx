/**
 * FileModalEditor component tests (framework-free): the editor is rendered with
 * a stub rpc + open-file emitter and driven by emitting open-file events. No
 * dsh test-runtime, no Cordis mount.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SidebarResult } from '../../../src/contract/errors.ts'
import type { BetterSidebarRpc } from '../../../src/client/rpc-client.ts'
import { Endpoints, type BetterSidebarEndpoint, type BetterSidebarReqMap, type BetterSidebarResMap } from '../../../src/contract/rpc.ts'
import { ExplorerOpenFileEmitter, type ExplorerOpenFileEvent } from '../../../src/client/tabs/explorer/events.ts'
import { en } from '../../../src/client/locales.ts'
import { FileModalEditor } from '../../../src/client/editor/FileModalEditor.tsx'

/** Bound dock-namespace translate stub backed by the en dictionary. */
function dockT(key: string): string {
  return (en as Record<string, string>)[key] ?? key
}
const t = dockT as never as Parameters<typeof FileModalEditor>[0]['t']

type Handler = (payload: Record<string, unknown>) => Promise<SidebarResult<unknown>>

/** Minimal recorded rpc with a per-endpoint handler. */
class FakeRpc implements BetterSidebarRpc {
  readonly calls: { endpoint: BetterSidebarEndpoint; payload: Record<string, unknown> }[] = []
  private handlers = new Map<BetterSidebarEndpoint, Handler>()

  setHandler(endpoint: BetterSidebarEndpoint, handler: Handler): void {
    this.handlers.set(endpoint, handler)
  }

  async call<E extends BetterSidebarEndpoint>(
    endpoint: E,
    payload: BetterSidebarReqMap[E],
  ): Promise<SidebarResult<BetterSidebarResMap[E]>> {
    this.calls.push({ endpoint, payload: payload as unknown as Record<string, unknown> })
    const handler = this.handlers.get(endpoint)
    if (handler === undefined) return { ok: true, value: null as never }
    return handler(payload as unknown as Record<string, unknown>) as Promise<SidebarResult<BetterSidebarResMap[E]>>
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(res => { resolve = res })
  return { promise, resolve }
}

function openEvent(path: string, name = path.split('/').pop() ?? path, rootPath = '/workspace'): ExplorerOpenFileEvent {
  return { path, name, kind: 'file', source: 'double-click', rootPath }
}

afterEach(() => cleanup())

describe('FileModalEditor', () => {
  it('renders nothing until an open-file event arrives, then shows the content', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    rpc.setHandler(Endpoints.explorerRead, () => Promise.resolve({
      ok: true,
      value: { path: '/workspace/a.txt', content: 'hello', truncated: false },
    }))
    render(<FileModalEditor rpc={rpc} events={emitter} t={t} />)
    expect(screen.queryByRole('dialog')).toBeNull()

    act(() => emitter.emit(openEvent('/workspace/a.txt')))
    // Loading state first, then the fetched content.
    expect(screen.getByRole('status')).toBeTruthy()
    expect(await screen.findByText('hello')).toBeTruthy()
    const call = rpc.calls.find(c => c.endpoint === Endpoints.explorerRead)
    expect(call?.payload).toEqual({ path: '/workspace/a.txt' })
  })

  it('shows the file name in the dialog title', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    rpc.setHandler(Endpoints.explorerRead, () => Promise.resolve({
      ok: true,
      value: { path: '/workspace/deep/nested.txt', content: 'x', truncated: false },
    }))
    render(<FileModalEditor rpc={rpc} events={emitter} t={t} />)
    act(() => emitter.emit(openEvent('/workspace/deep/nested.txt')))
    expect(screen.getByRole('dialog', { name: 'View file' })).toBeTruthy()
    expect(screen.getByText('nested.txt')).toBeTruthy()
  })

  it('shows the host error message when the read fails', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    rpc.setHandler(Endpoints.explorerRead, () => Promise.resolve({
      ok: false,
      error: { code: 'not-found', message: 'no such file', path: '/workspace/missing.txt' },
    }))
    render(<FileModalEditor rpc={rpc} events={emitter} t={t} />)
    act(() => emitter.emit(openEvent('/workspace/missing.txt')))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('no such file')).toBeTruthy()
  })

  it('closes via the close button', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    rpc.setHandler(Endpoints.explorerRead, () => Promise.resolve({
      ok: true,
      value: { path: '/workspace/a.txt', content: 'hello', truncated: false },
    }))
    render(<FileModalEditor rpc={rpc} events={emitter} t={t} />)
    act(() => emitter.emit(openEvent('/workspace/a.txt')))
    await screen.findByText('hello')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on the Escape key', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    rpc.setHandler(Endpoints.explorerRead, () => Promise.resolve({
      ok: true,
      value: { path: '/workspace/a.txt', content: 'hello', truncated: false },
    }))
    render(<FileModalEditor rpc={rpc} events={emitter} t={t} />)
    act(() => emitter.emit(openEvent('/workspace/a.txt')))
    await screen.findByText('hello')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes when the backdrop is clicked', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    rpc.setHandler(Endpoints.explorerRead, () => Promise.resolve({
      ok: true,
      value: { path: '/workspace/a.txt', content: 'hello', truncated: false },
    }))
    render(<FileModalEditor rpc={rpc} events={emitter} t={t} />)
    act(() => emitter.emit(openEvent('/workspace/a.txt')))
    await screen.findByText('hello')
    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog.parentElement as HTMLElement)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('marks a truncated file read', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    rpc.setHandler(Endpoints.explorerRead, () => Promise.resolve({
      ok: true,
      value: { path: '/workspace/big.txt', content: 'alpha', truncated: true },
    }))
    render(<FileModalEditor rpc={rpc} events={emitter} t={t} />)
    act(() => emitter.emit(openEvent('/workspace/big.txt')))
    expect(await screen.findByText(/file is large/)).toBeTruthy()
  })

  it('ignores a stale response when a newer open supersedes an in-flight read', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    const first = deferred<SidebarResult<unknown>>()
    const second = deferred<SidebarResult<unknown>>()
    rpc.setHandler(Endpoints.explorerRead, (payload) => payload.path === '/workspace/first.txt' ? first.promise : second.promise)
    render(<FileModalEditor rpc={rpc} events={emitter} t={t} />)

    act(() => emitter.emit(openEvent('/workspace/first.txt')))
    act(() => emitter.emit(openEvent('/workspace/second.txt')))
    // Resolve the stale first response AFTER the second — it must be dropped.
    await act(async () => { first.resolve({ ok: true, value: { path: '/workspace/first.txt', content: 'STALE', truncated: false } }) })
    expect(screen.queryByText('STALE')).toBeNull()
    await act(async () => { second.resolve({ ok: true, value: { path: '/workspace/second.txt', content: 'FRESH', truncated: false } }) })
    expect(await screen.findByText('FRESH')).toBeTruthy()
  })

  it('calls gitDiff and renders a two-pane diff when the open event carries diff', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    rpc.setHandler(Endpoints.gitDiff, () => Promise.resolve({
      ok: true,
      value: {
        diff: 'diff --git a/a.txt b/a.txt\n@@ -1,2 +1,2 @@\n alpha\n-gone\n+added\n omega\n',
        empty: false,
      },
    }))
    render(<FileModalEditor rpc={rpc} events={emitter} t={t} />)
    const event: ExplorerOpenFileEvent = {
      path: '/workspace/repo/a.txt', name: 'a.txt', kind: 'file', source: 'double-click', rootPath: '/workspace/repo',
      diff: { kind: 'status', base: 'head', root: '/workspace/repo', file: 'a.txt' },
    }
    act(() => emitter.emit(event))
    expect(screen.getByRole('status')).toBeTruthy()
    // The added line is unique (appears only on the right pane).
    expect(await screen.findByText('added')).toBeTruthy()
    // Context appears on both panes (twice); no raw single-pane <pre> is used.
    expect(screen.getAllByText('alpha')).toHaveLength(2)
    expect(screen.queryByText(/diff --git a\/a.txt/)).toBeNull()
    const call = rpc.calls.find(c => c.endpoint === Endpoints.gitDiff)
    expect(call?.payload).toEqual({ path: '/workspace/repo', file: 'a.txt', base: 'head' })
    // A diff-mode open must not also read the raw file.
    expect(rpc.calls.some(c => c.endpoint === Endpoints.explorerRead)).toBe(false)
  })

  it('renders old lines on the left pane and new lines on the right pane', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    rpc.setHandler(Endpoints.gitDiff, () => Promise.resolve({
      ok: true,
      value: {
        diff: 'diff --git a/a.txt b/a.txt\n@@ -1,3 +1,3 @@\n keep\n-old\n+new\n',
        empty: false,
      },
    }))
    render(<FileModalEditor rpc={rpc} events={emitter} t={t} />)
    const event: ExplorerOpenFileEvent = {
      path: '/workspace/repo/a.txt', name: 'a.txt', kind: 'file', source: 'double-click', rootPath: '/workspace/repo',
      diff: { kind: 'status', base: 'index', root: '/workspace/repo', file: 'a.txt' },
    }
    act(() => emitter.emit(event))
    const oldEl = await screen.findByText('old')
    const newEl = screen.getByText('new')
    // The deleted line 'old' belongs to the LEFT (old) pane and the added line
    // 'new' to the RIGHT (new) pane, so 'old' precedes 'new' in DOM order.
    expect(oldEl.compareDocumentPosition(newEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Added/deleted lines appear exactly once each (not duplicated across panes).
    expect(screen.getAllByText('old')).toHaveLength(1)
    expect(screen.getAllByText('new')).toHaveLength(1)
    // Context appears on both panes.
    expect(screen.getAllByText('keep')).toHaveLength(2)
  })

  it('shows a no-changes notice for an empty diff', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    rpc.setHandler(Endpoints.gitDiff, () => Promise.resolve({
      ok: true,
      value: { diff: '', empty: true },
    }))
    render(<FileModalEditor rpc={rpc} events={emitter} t={t} />)
    const event: ExplorerOpenFileEvent = {
      path: '/workspace/repo/a.txt', name: 'a.txt', kind: 'file', source: 'double-click', rootPath: '/workspace/repo',
      diff: { kind: 'status', base: 'index', root: '/workspace/repo', file: 'a.txt' },
    }
    act(() => emitter.emit(event))
    expect(await screen.findByText(/no changes/)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeTruthy()
  })

  it('falls back to the raw text in a single pane for an unparseable diff', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    const raw = 'diff --git a/a.txt b/a.txt\n+++ b/a.txt\nno hunk here'
    rpc.setHandler(Endpoints.gitDiff, () => Promise.resolve({
      ok: true,
      value: { diff: raw, empty: false },
    }))
    render(<FileModalEditor rpc={rpc} events={emitter} t={t} />)
    const event: ExplorerOpenFileEvent = {
      path: '/workspace/repo/a.txt', name: 'a.txt', kind: 'file', source: 'double-click', rootPath: '/workspace/repo',
      diff: { kind: 'status', base: 'index', root: '/workspace/repo', file: 'a.txt' },
    }
    act(() => emitter.emit(event))
    // No crash; the raw patch text is rendered verbatim as fallback content.
    expect(await screen.findByText(/no hunk here/)).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('renders multiple hunks sequentially', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    rpc.setHandler(Endpoints.gitDiff, () => Promise.resolve({
      ok: true,
      value: {
        diff: '@@ -1,1 +1,1 @@\n-a\n+A\n@@ -10,1 +11,1 @@\n-b\n+B\n',
        empty: false,
      },
    }))
    render(<FileModalEditor rpc={rpc} events={emitter} t={t} />)
    const event: ExplorerOpenFileEvent = {
      path: '/workspace/repo/a.txt', name: 'a.txt', kind: 'file', source: 'double-click', rootPath: '/workspace/repo',
      diff: { kind: 'status', base: 'head', root: '/workspace/repo', file: 'a.txt' },
    }
    act(() => emitter.emit(event))
    expect(await screen.findByText('A')).toBeTruthy()
    expect(screen.getByText('B')).toBeTruthy()
    // Both hunk headers are rendered.
    expect(screen.getByText('@@ -1 +1 @@')).toBeTruthy()
    expect(screen.getByText('@@ -10 +11 @@')).toBeTruthy()
  })

  it('calls explorerRead and renders content when the open carries no diff', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    rpc.setHandler(Endpoints.explorerRead, () => Promise.resolve({
      ok: true,
      value: { path: '/workspace/a.txt', content: 'hello', truncated: false },
    }))
    render(<FileModalEditor rpc={rpc} events={emitter} t={t} />)
    act(() => emitter.emit(openEvent('/workspace/a.txt')))
    expect(await screen.findByText('hello')).toBeTruthy()
    expect(rpc.calls.find(c => c.endpoint === Endpoints.gitDiff)).toBeUndefined()
  })

  it('shows the error message when a diff fetch fails', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    rpc.setHandler(Endpoints.gitDiff, () => Promise.resolve({
      ok: false,
      error: { code: 'git-failed', message: 'git diff exploded', stderrTail: 'x' },
    }))
    render(<FileModalEditor rpc={rpc} events={emitter} t={t} />)
    const event: ExplorerOpenFileEvent = {
      path: '/workspace/repo/a.txt', name: 'a.txt', kind: 'file', source: 'double-click', rootPath: '/workspace/repo',
      diff: { kind: 'status', base: 'index', root: '/workspace/repo', file: 'a.txt' },
    }
    act(() => emitter.emit(event))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('git diff exploded')).toBeTruthy()
  })

  it('calls gitCommitFileDiff and renders a two-pane diff for a kind:commit open', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    rpc.setHandler(Endpoints.gitCommitFileDiff, () => Promise.resolve({
      ok: true,
      value: {
        diff: 'diff --git a/a.txt b/a.txt\n@@ -1,2 +1,2 @@\n alpha\n-gone\n+added\n omega\n',
        empty: false,
      },
    }))
    render(<FileModalEditor rpc={rpc} events={emitter} t={t} />)
    const event: ExplorerOpenFileEvent = {
      path: '/workspace/repo/a.txt', name: 'a.txt', kind: 'file', source: 'double-click', rootPath: '/workspace/repo',
      diff: { kind: 'commit', root: '/workspace/repo', hash: 'deadbeef', file: 'a.txt' },
    }
    act(() => emitter.emit(event))
    expect(await screen.findByText('added')).toBeTruthy()
    // Context appears on both panes (twice); no raw single-pane <pre> is used.
    expect(screen.getAllByText('alpha')).toHaveLength(2)
    expect(screen.queryByText(/diff --git a\/a.txt/)).toBeNull()
    const call = rpc.calls.find(c => c.endpoint === Endpoints.gitCommitFileDiff)
    expect(call?.payload).toEqual({ path: '/workspace/repo', hash: 'deadbeef', file: 'a.txt' })
    // A commit open must neither read the raw file nor call the working-tree diff.
    expect(rpc.calls.some(c => c.endpoint === Endpoints.explorerRead)).toBe(false)
    expect(rpc.calls.some(c => c.endpoint === Endpoints.gitDiff)).toBe(false)
  })

  it('never calls the commit-file-diff endpoint for a kind:status open', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    rpc.setHandler(Endpoints.gitDiff, () => Promise.resolve({
      ok: true,
      value: { diff: 'diff --git a/a.txt b/a.txt\n@@ -1,1 +1,1 @@\n-old\n+new\n', empty: false },
    }))
    render(<FileModalEditor rpc={rpc} events={emitter} t={t} />)
    const event: ExplorerOpenFileEvent = {
      path: '/workspace/repo/a.txt', name: 'a.txt', kind: 'file', source: 'double-click', rootPath: '/workspace/repo',
      diff: { kind: 'status', base: 'index', root: '/workspace/repo', file: 'a.txt' },
    }
    act(() => emitter.emit(event))
    await screen.findByText('new')
    expect(rpc.calls.some(c => c.endpoint === Endpoints.gitCommitFileDiff)).toBe(false)
  })

  it('renders resize handles and applies a persisted modal size to the dialog', async () => {
    localStorage.setItem('dsh.betterSidebar.fileModalSize', JSON.stringify({ width: 820, height: 600 }))
    try {
      const rpc = new FakeRpc()
      const emitter = new ExplorerOpenFileEmitter()
      rpc.setHandler(Endpoints.explorerRead, () => Promise.resolve({
        ok: true,
        value: { path: '/workspace/a.txt', content: 'hello', truncated: false },
      }))
      render(<FileModalEditor rpc={rpc} events={emitter} t={t} />)
      act(() => emitter.emit(openEvent('/workspace/a.txt')))
      await screen.findByText('hello')
      const dialog = screen.getByRole('dialog') as HTMLElement
      // The persisted size is injected as dialogs CSS custom properties.
      expect(dialog.style.getPropertyValue('--bsd-modal-w')).toBe('820px')
      expect(dialog.style.getPropertyValue('--bsd-modal-h')).toBe('600px')
      // Both resize handles render (right-edge width + bottom-right corner).
      expect(screen.getAllByRole('separator')).toHaveLength(2)
    } finally {
      localStorage.removeItem('dsh.betterSidebar.fileModalSize')
    }
  })
})

// Keep the vitest import for isolation; the describe below documents the
// subscription lifecycle (a disposer is returned and cleanly on re-emit).
describe('FileModalEditor subscription', () => {
  it('disposes its listener when unmounted (no further opens render)', () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    rpc.setHandler(Endpoints.explorerRead, () => Promise.resolve({
      ok: true,
      value: { path: '/workspace/a.txt', content: 'hello', truncated: false },
    }))
    const { unmount } = render(<FileModalEditor rpc={rpc} events={emitter} t={t} />)
    unmount()
    act(() => emitter.emit(openEvent('/workspace/a.txt')))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
