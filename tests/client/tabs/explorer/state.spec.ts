import { describe, expect, it } from 'vitest'
import type { ExplorerEntry, ExplorerListResult } from '../../../../src/contract/explorer.ts'
import type { SidebarResult } from '../../../../src/contract/errors.ts'
import { ExplorerStore, type DirectoryLoader } from '../../../../src/client/tabs/explorer/state.ts'

function fileEntry(path: string): ExplorerEntry {
  return { name: path.split('/').pop() ?? path, path, kind: 'file', hidden: false }
}

function dirEntry(path: string): ExplorerEntry {
  return { name: path.split('/').pop() ?? path, path, kind: 'directory', hidden: false }
}

function okResult(path: string, entries: ExplorerEntry[]): SidebarResult<ExplorerListResult> {
  return { ok: true, value: { path, entries, truncated: false } }
}

function errResult(code: 'not-found' | 'permission-denied' | 'internal', path: string): SidebarResult<ExplorerListResult> {
  return { ok: false, error: { code, message: code, path } }
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

/**
 * Loader that records call order and returns a fresh deferred per call, so a
 * test can resolve responses out of order to exercise the stale guards.
 */
function controllableLoader() {
  const calls: string[] = []
  const pending: Deferred<SidebarResult<ExplorerListResult>>[] = []
  const loader: DirectoryLoader = (path) => {
    calls.push(path)
    const d = deferred<SidebarResult<ExplorerListResult>>()
    pending.push(d)
    return d.promise
  }
  return {
    loader,
    calls,
    resolve(i: number, result: SidebarResult<ExplorerListResult>) { pending[i]?.resolve(result) },
  }
}

function simpleLoader(routes: Record<string, SidebarResult<ExplorerListResult>>) {
  const calls: string[] = []
  const loader: DirectoryLoader = async (path) => {
    calls.push(path)
    return routes[path] ?? errResult('not-found', path)
  }
  return { loader, calls }
}

describe('ExplorerStore', () => {
  it('starts in the no-workspace surface with an empty tree', () => {
    const { loader } = simpleLoader({})
    const store = new ExplorerStore(loader)
    expect(store.snapshot().surface).toEqual({ phase: 'no-workspace' })
    expect(store.snapshot().root).toBeUndefined()
    expect(store.snapshot().rootGen).toBe(0)
  })

  it('setRoot installs the root dot node and bumps rootGen', () => {
    const { loader } = simpleLoader({})
    const store = new ExplorerStore(loader)
    store.setRoot('/r')
    const snapshot = store.snapshot()
    expect(snapshot.root).toBe('/r')
    expect(snapshot.surface.phase).toBe('loading')
    expect(snapshot.nodes['/r']?.entry.kind).toBe('directory')
    expect(snapshot.rootGen).toBe(1)
  })

  it('setRoot(undefined) returns to the empty surface', () => {
    const { loader } = simpleLoader({})
    const store = new ExplorerStore(loader)
    store.setRoot('/r')
    store.setRoot(undefined)
    expect(store.snapshot().surface).toEqual({ phase: 'no-workspace' })
    expect(store.snapshot().root).toBeUndefined()
  })

  it('loadRoot lists the root and transitions to loaded', async () => {
    const { loader } = simpleLoader({ '/r': okResult('/r', [dirEntry('/r/a'), fileEntry('/r/b')]) })
    const store = new ExplorerStore(loader)
    store.setRoot('/r')
    await store.loadRoot()
    const node = store.snapshot().nodes['/r']
    expect(store.snapshot().surface).toEqual({ phase: 'loaded' })
    expect(node?.loadState).toBe('loaded')
    expect(node?.children?.map(e => e.name)).toEqual(['a', 'b'])
  })

  it('expand lazily loads a directory once; collapse keeps its children', async () => {
    const { loader } = simpleLoader({
      '/r': okResult('/r', [dirEntry('/r/a')]),
      '/r/a': okResult('/r/a', [fileEntry('/r/a/f1'), fileEntry('/r/a/f2')]),
    })
    const store = new ExplorerStore(loader)
    store.setRoot('/r')
    await store.loadRoot()

    expect(store.snapshot().nodes['/r/a']).toBeUndefined()
    await store.expand('/r/a')
    let node = store.snapshot().nodes['/r/a']
    expect(node?.expanded).toBe(true)
    expect(node?.loadState).toBe('loaded')
    expect(node?.children?.map(e => e.name)).toEqual(['f1', 'f2'])

    store.collapse('/r/a')
    node = store.snapshot().nodes['/r/a']
    expect(node?.expanded).toBe(false)
    // Collapse does NOT unload.
    expect(node?.children?.map(e => e.name)).toEqual(['f1', 'f2'])
    expect(node?.loadState).toBe('loaded')
  })

  it('re-expanding a loaded directory does not re-request', async () => {
    const routes = {
      '/r': okResult('/r', [dirEntry('/r/a')]),
      '/r/a': okResult('/r/a', [fileEntry('/r/a/f1')]),
    }
    const { loader, calls } = simpleLoader(routes)
    const store = new ExplorerStore(loader)
    store.setRoot('/r')
    await store.loadRoot()
    await store.expand('/r/a')
    store.collapse('/r/a')
    await store.expand('/r/a')
    // Root listed once, /r/a listed exactly once (collapse kept it).
    expect(calls.filter(p => p === '/r/a')).toHaveLength(1)
  })

  it('discards a stale response for a path after a re-request supersedes it', async () => {
    const c = controllableLoader()
    const store = new ExplorerStore(c.loader)
    store.setRoot('/r')
    const rootLoad = store.loadRoot()
    c.resolve(0, okResult('/r', [dirEntry('/r/a')]))
    await rootLoad

    const first = store.expand('/r/a')
    store.collapse('/r/a')
    const second = store.expand('/r/a')
    // Resolve the newer response first, then the stale one lands late.
    c.resolve(2, okResult('/r/a', [fileEntry('/r/a/newer')]))
    c.resolve(1, okResult('/r/a', [fileEntry('/r/a/stale')]))
    await Promise.all([first, second])

    const node = store.snapshot().nodes['/r/a']
    expect(node?.children?.map(e => e.name)).toEqual(['newer'])
  })

  it('discards in-flight results from a previous root (rootGen guard)', async () => {
    const c = controllableLoader()
    const store = new ExplorerStore(c.loader)
    store.setRoot('/r1')
    const load1 = store.loadRoot()
    // Swap roots before the first response lands.
    store.setRoot('/r2')
    const load2 = store.loadRoot()
    c.resolve(1, okResult('/r2', [fileEntry('/r2/new')]))
    c.resolve(0, okResult('/r1', [fileEntry('/r1/old')]))
    await Promise.all([load1, load2])

    const snapshot = store.snapshot()
    expect(snapshot.root).toBe('/r2')
    expect(snapshot.nodes['/r2']?.children?.map(e => e.name)).toEqual(['new'])
    // The stale tree was reset away entirely.
    expect(snapshot.nodes['/r1']).toBeUndefined()
  })

  it('marks a failed root listing as root-error and retry reloads', async () => {
    const routes = {
      '/bad': errResult('not-found', '/bad'),
      '/good': okResult('/good', [fileEntry('/good/f')]),
    }
    const { loader, calls } = simpleLoader(routes)
    const store = new ExplorerStore(loader)
    store.setRoot('/bad')
    await store.loadRoot()
    let snapshot = store.snapshot()
    expect(snapshot.surface.phase).toBe('root-error')
    expect(snapshot.surface.phase === 'root-error' && snapshot.surface.error.code).toBe('not-found')

    store.setRoot('/good')
    await store.loadRoot()
    snapshot = store.snapshot()
    expect(snapshot.surface.phase).toBe('loaded')
    expect(snapshot.nodes['/good']?.children?.map(e => e.name)).toEqual(['f'])
    void calls
  })

  it('marks a failed directory expansion as an inline error node', async () => {
    const routes = {
      '/r': okResult('/r', [dirEntry('/r/a')]),
      '/r/a': errResult('permission-denied', '/r/a'),
    }
    const { loader } = simpleLoader(routes)
    const store = new ExplorerStore(loader)
    store.setRoot('/r')
    await store.loadRoot()
    await store.expand('/r/a')
    const node = store.snapshot().nodes['/r/a']
    expect(node?.loadState).toBe('error')
    expect(node?.loadError?.code).toBe('permission-denied')
    expect(node?.children).toBeUndefined()
  })

  it('retries a failed directory expansion on re-expand', async () => {
    // First attempt fails; the route is then fixed and re-expand reloads.
    let failed = true
    const loader: DirectoryLoader = async (path, _signal) => {
      if (path === '/r/a' && failed) return errResult('permission-denied', '/r/a')
      return okResult(path, path === '/r/a'
        ? [fileEntry('/r/a/f1')]
        : [dirEntry('/r/a')])
    }
    const store = new ExplorerStore(loader)
    store.setRoot('/r')
    await store.loadRoot()
    await store.expand('/r/a')
    expect(store.snapshot().nodes['/r/a']?.loadState).toBe('error')

    // Retry after fixing the cause reloads and clears the error.
    failed = false
    await store.expand('/r/a')
    const node = store.snapshot().nodes['/r/a']
    expect(node?.loadState).toBe('loaded')
    expect(node?.loadError).toBeUndefined()
    expect(node?.children?.map(e => e.name)).toEqual(['f1'])
  })

  it('refresh re-lists the root and every loaded directory', async () => {
    const routes = {
      '/r': okResult('/r', [dirEntry('/r/a')]),
      '/r/a': okResult('/r/a', [fileEntry('/r/a/f1')]),
    }
    const { loader, calls } = simpleLoader(routes)
    const store = new ExplorerStore(loader)
    store.setRoot('/r')
    await store.loadRoot()
    await store.expand('/r/a')

    calls.length = 0
    await store.refresh()
    expect(calls).toEqual(['/r', '/r/a'])
  })

  it('prunePath removes a subtree and clears a pruned selection', async () => {
    const routes = {
      '/r': okResult('/r', [dirEntry('/r/a'), fileEntry('/r/b')]),
      '/r/a': okResult('/r/a', [fileEntry('/r/a/leaf')]),
    }
    const { loader } = simpleLoader(routes)
    const store = new ExplorerStore(loader)
    store.setRoot('/r')
    await store.loadRoot()
    await store.expand('/r/a')
    store.select('/r/a/leaf')
    store.focus('/r/a/leaf')

    store.prunePath('/r/a')
    const snapshot = store.snapshot()
    expect(snapshot.nodes['/r/a']).toBeUndefined()
    expect(snapshot.nodes['/r/a/leaf']).toBeUndefined()
    expect(snapshot.nodes['/r']?.children?.map(e => e.path)).toEqual(['/r/b'])
    expect(snapshot.selectedPath).toBeUndefined()
    // Focus moves to the pruned node's parent (/r).
    expect(snapshot.focusedPath).toBe('/r')
  })

  it('notifies subscribers when state changes', () => {
    const { loader } = simpleLoader({})
    const store = new ExplorerStore(loader)
    const seen: string[] = []
    const unsubscribe = store.subscribe(() => seen.push('tick'))
    store.setRoot('/r')
    store.select('/r')
    unsubscribe()
    store.collapse('/r')
    expect(seen).toEqual(['tick', 'tick'])
  })
})