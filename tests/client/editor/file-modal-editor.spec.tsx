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
