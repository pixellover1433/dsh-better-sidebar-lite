/**
 * Git tab component tests (D8 §3.6): framework-free — GitTab is rendered inside
 * a DockContext.Provider with a stub rpc and stub session/workspace hooks. No
 * dsh test-runtime, no Cordis mount.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SessionListState, WorkspaceListState, SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { DockContext, type DockContextValue } from '../../../../src/client/dock/context.ts'
import type { GitLogResult, GitStatusEntry, GitStatusResult } from '../../../../src/contract/git.ts'
import type { SidebarError, SidebarResult } from '../../../../src/contract/errors.ts'
import { Endpoints, type BetterSidebarEndpoint, type BetterSidebarReqMap, type BetterSidebarResMap } from '../../../../src/contract/rpc.ts'
import type { BetterSidebarRpc } from '../../../../src/client/rpc-client.ts'
import { AUTO_REFRESH_DEBOUNCE_MS, GitTab, type GitTabProps } from '../../../../src/client/tabs/git/git-tab.tsx'
import { SETTINGS_DEFAULTS, type BetterSidebarSettings } from '../../../../src/contract/settings.ts'
import { ExplorerOpenFileEmitter, type ExplorerOpenFileEvent } from '../../../../src/client/tabs/explorer/events.ts'

/** Locale stub: render keys verbatim so assertions read the raw key. */
const t: GitTabProps['t'] = (key) => key

const ROOT = '/workspace/repo'

const SESSIONS = {
  ids: ['s1'],
  byId: { s1: { id: 's1', displayTitle: 'Repo', cwd: ROOT, running: false, blank: false, updatedAt: 0 } },
  current: 's1',
  phase: 'ready',
  subagentsByParent: {},
  jobsBySession: {},
  currentAddress: undefined,
} as unknown as SessionListState

const WORKSPACES = {
  items: [],
  archivedSessionIds: [],
  state: 'idle',
  phase: 'ready',
  error: null,
  baselinesReady: true,
  recentWorkspaceId: undefined,
} as unknown as WorkspaceListState

/** Build a SnapshotSelectorHook stub that returns a fixed state for any selector. */
function fixedHook<V>(value: V): SnapshotSelectorHook<V> {
  return ((sel: (s: V) => unknown) => sel(value)) as SnapshotSelectorHook<V>
}

/** Bound settings scope double serving overrides over the contract defaults.
 *  Returns a STABLE snapshot so useSyncExternalStore never sees identity churn. */
function fakeSettingsScope(overrides: Partial<BetterSidebarSettings> = {}): SettingsScope<BetterSidebarSettings> {
  const value: BetterSidebarSettings = { ...SETTINGS_DEFAULTS, ...overrides }
  const snapshot: SettingsScopeSnapshot<BetterSidebarSettings> = {
    status: 'ready',
    value,
    base: SETTINGS_DEFAULTS,
    user: {},
    revision: 0,
    writable: true,
    mode: 'host',
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    set: async () => {},
    unset: async () => {},
  }
}

function entry(overrides: Partial<GitStatusEntry> & { path: string }): GitStatusEntry {
  return {
    xy: ' M',
    submodule: false,
    staged: false,
    unstaged: false,
    untracked: false,
    conflicted: false,
    ...overrides,
  }
}

interface RecordedCall {
  endpoint: BetterSidebarEndpoint
  payload: Record<string, unknown>
  signal: AbortSignal | undefined
}

type Handler = (payload: Record<string, unknown>, signal?: AbortSignal) => Promise<SidebarResult<unknown>>

/** In-memory BetterSidebarRpc with per-endpoint handlers and a call log. */
class FakeRpc implements BetterSidebarRpc {
  readonly calls: RecordedCall[] = []
  private handlers = new Map<BetterSidebarEndpoint, Handler>()

  setHandler(endpoint: BetterSidebarEndpoint, handler: Handler): void {
    this.handlers.set(endpoint, handler)
  }

  async call<E extends BetterSidebarEndpoint>(
    endpoint: E,
    payload: BetterSidebarReqMap[E],
    opts?: { signal?: AbortSignal },
  ): Promise<SidebarResult<BetterSidebarResMap[E]>> {
    this.calls.push({ endpoint, payload: payload as unknown as Record<string, unknown>, signal: opts?.signal })
    const handler = this.handlers.get(endpoint)
    if (handler === undefined) return { ok: true, value: null as never }
    return handler(payload as unknown as Record<string, unknown>, opts?.signal) as Promise<SidebarResult<BetterSidebarResMap[E]>>
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(res => { resolve = res })
  return { promise, resolve }
}

function errStatus(code: SidebarError['code'], message: string): SidebarResult<GitStatusResult> {
  return { ok: false, error: { code, message } as SidebarError }
}

function errLog(code: SidebarError['code'], message: string): SidebarResult<GitLogResult> {
  return { ok: false, error: { code, message } as SidebarError }
}

const emptyLogResult: GitLogResult = { entries: [], truncated: false }
const emptyStatus: GitStatusResult = { staged: [], unstaged: [], untracked: [], conflicted: [], truncated: false }

/** Canned status with staged + unstaged + untracked groups and a head branch. */
function mixedStatus(): GitStatusResult {
  return {
    staged: [entry({ xy: 'M ', path: 'a.txt', staged: true })],
    unstaged: [entry({ xy: ' M', path: 'b.txt', unstaged: true })],
    untracked: [entry({ xy: '??', path: 'new/c.txt', untracked: true })],
    conflicted: [],
    truncated: false,
    head: 'main',
  }
}

afterEach(() => cleanup())

function renderGitTab(rpc: BetterSidebarRpc, emitter: ExplorerOpenFileEmitter = new ExplorerOpenFileEmitter()): void {
  const value: DockContextValue = {
    rpc,
    useSessions: fixedHook(SESSIONS),
    useWorkspaces: fixedHook(WORKSPACES),
    settings: undefined,
  }
  render(
    <DockContext.Provider value={value}>
      <GitTab rpc={rpc} emitter={emitter} t={t} />
    </DockContext.Provider>,
  )
}

describe('GitTab', () => {
  it('opens a commit, lists its changed files, and returns to the log', async () => {
    const rpc = new FakeRpc()
    const logResult: GitLogResult = {
      entries: [{
        hash: 'cccccccccccccccccccccccccccccccccccccccc',
        shortHash: 'ccccccc',
        authorName: 'Ada',
        authorEmail: 'ada@example.test',
        authoredAtISO: '2024-03-01T10:00:00Z',
        subject: 'Add the sidebar',
      }],
      truncated: false,
      head: 'main',
    }
    rpc.setHandler(Endpoints.gitStatus, () => Promise.resolve({ ok: true, value: emptyStatus }))
    rpc.setHandler(Endpoints.gitLog, () => Promise.resolve({ ok: true, value: logResult }))
    rpc.setHandler(Endpoints.gitCommitDetail, () => Promise.resolve({
      ok: true,
      value: {
        message: 'Add the sidebar\n\nImplements the right dock with explorer and git tabs.',
        files: [
          { status: 'A', path: 'src/sidebar.tsx' },
          { status: 'R', path: 'moved.ts', originalPath: 'old.ts', score: 100 },
        ],
      },
    }))
    renderGitTab(rpc)
    const user = userEvent.setup()

    await screen.findByText('Add the sidebar')
    await user.click(screen.getByText('Add the sidebar'))

    await waitFor(() => {
      const call = rpc.calls.find(c => c.endpoint === Endpoints.gitCommitDetail)
      expect(call).toBeTruthy()
      expect(call?.payload).toEqual({ path: ROOT, hash: 'cccccccccccccccccccccccccccccccccccccccc' })
    })
    await screen.findByText('src/sidebar.tsx')
    expect(screen.getByText(/Implements the right dock/)).toBeTruthy()
    expect(screen.getByText('moved.ts')).toBeTruthy()
    expect(screen.getByText(/old.ts/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /back/ })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /back/ }))
    expect(screen.getByText('Add the sidebar')).toBeTruthy()
    expect(screen.queryByText('src/sidebar.tsx')).toBeNull()
  })

  it('double-clicking a commit file row emits an open event with a kind:commit diff', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    const opened: ExplorerOpenFileEvent[] = []
    emitter.onOpenFile(e => opened.push(e))
    const logResult: GitLogResult = {
      entries: [{
        hash: 'cccccccccccccccccccccccccccccccccccccccc',
        shortHash: 'ccccccc',
        authorName: 'Ada',
        authorEmail: 'ada@example.test',
        authoredAtISO: '2024-03-01T10:00:00Z',
        subject: 'Add the sidebar',
      }],
      truncated: false,
      head: 'main',
    }
    rpc.setHandler(Endpoints.gitStatus, () => Promise.resolve({ ok: true, value: emptyStatus }))
    rpc.setHandler(Endpoints.gitLog, () => Promise.resolve({ ok: true, value: logResult }))
    rpc.setHandler(Endpoints.gitCommitDetail, () => Promise.resolve({
      ok: true,
      value: {
        message: 'Add the sidebar',
        files: [
          { status: 'A', path: 'src/sidebar.tsx' },
          { status: 'R', path: 'moved.ts', originalPath: 'old.ts', score: 100 },
        ],
      },
    }))
    renderGitTab(rpc, emitter)
    const user = userEvent.setup()

    await screen.findByText('Add the sidebar')
    await user.click(screen.getByText('Add the sidebar'))
    await screen.findByText('src/sidebar.tsx')

    // Double-click the renamed file's destination path.
    await user.dblClick(screen.getByText('moved.ts'))
    expect(opened).toHaveLength(1)
    expect(opened[0]).toMatchObject({
      path: '/workspace/repo/moved.ts', name: 'moved.ts', kind: 'file', source: 'double-click', rootPath: ROOT,
      diff: { kind: 'commit', root: ROOT, hash: 'cccccccccccccccccccccccccccccccccccccccc', file: 'moved.ts' },
    })
  })

  it('shows an error banner with retry when the commit-files fetch fails', async () => {
    const rpc = new FakeRpc()
    const logResult: GitLogResult = {
      entries: [{
        hash: 'dddddddddddddddddddddddddddddddddddddddd',
        shortHash: 'ddddddd',
        authorName: 'Bo',
        authorEmail: 'bo@example.test',
        authoredAtISO: '2024-03-02T10:00:00Z',
        subject: 'Break something',
      }],
      truncated: false,
    }
    rpc.setHandler(Endpoints.gitStatus, () => Promise.resolve({ ok: true, value: emptyStatus }))
    rpc.setHandler(Endpoints.gitLog, () => Promise.resolve({ ok: true, value: logResult }))
    rpc.setHandler(Endpoints.gitCommitDetail, () => Promise.resolve({ ok: false, error: { code: 'git-failed', message: 'diff-tree exploded', stderrTail: 'x' } }))
    renderGitTab(rpc)
    const user = userEvent.setup()

    await screen.findByText('Break something')
    await user.click(screen.getByText('Break something'))
    await screen.findByText('diff-tree exploded')
    expect(screen.getByRole('button', { name: 'errorRetry' })).toBeTruthy()
  })

  it('renders status sections with their rows and the branch head', async () => {
    const rpc = new FakeRpc()
    rpc.setHandler(Endpoints.gitStatus, () => Promise.resolve({ ok: true, value: mixedStatus() }))
    rpc.setHandler(Endpoints.gitLog, () => Promise.resolve({ ok: true, value: emptyLogResult }))
    renderGitTab(rpc)

    await screen.findByText('main')
    expect(screen.getByText('staged')).toBeTruthy()
    expect(screen.getByText('changes')).toBeTruthy()
    expect(screen.getByText('untracked')).toBeTruthy()
    expect(screen.queryByText('conflicts')).toBeNull()
    expect(screen.getByText('a.txt')).toBeTruthy()
    expect(screen.getByText('b.txt')).toBeTruthy()
    expect(screen.getByText('c.txt')).toBeTruthy()
    expect(screen.getByText('new/')).toBeTruthy()
  })

  it('opens a row file on double-click via the shared open-file emitter', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    const opened: ExplorerOpenFileEvent[] = []
    emitter.onOpenFile(e => opened.push(e))
    rpc.setHandler(Endpoints.gitStatus, () => Promise.resolve({ ok: true, value: mixedStatus() }))
    rpc.setHandler(Endpoints.gitLog, () => Promise.resolve({ ok: true, value: emptyLogResult }))
    renderGitTab(rpc, emitter)
    const user = userEvent.setup()

    await screen.findByText('b.txt')
    await user.dblClick(screen.getByText('b.txt'))

    expect(opened).toHaveLength(1)
    expect(opened[0]).toMatchObject({
      path: '/workspace/repo/b.txt', name: 'b.txt', kind: 'file', source: 'double-click', rootPath: ROOT,
      diff: { kind: 'status', base: 'index', root: ROOT, file: 'b.txt' },
    })
  })

  it('opens a staged row with a diff base of head (index vs HEAD)', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    const opened: ExplorerOpenFileEvent[] = []
    emitter.onOpenFile(e => opened.push(e))
    rpc.setHandler(Endpoints.gitStatus, () => Promise.resolve({ ok: true, value: mixedStatus() }))
    rpc.setHandler(Endpoints.gitLog, () => Promise.resolve({ ok: true, value: emptyLogResult }))
    renderGitTab(rpc, emitter)
    const user = userEvent.setup()

    await screen.findByText('a.txt')
    await user.dblClick(screen.getByText('a.txt'))

    expect(opened).toHaveLength(1)
    expect(opened[0]?.diff).toEqual({ kind: 'status', base: 'head', root: ROOT, file: 'a.txt' })
  })

  it('opens a nested untracked row with no diff (full-content representation)', async () => {
    const rpc = new FakeRpc()
    const emitter = new ExplorerOpenFileEmitter()
    const opened: ExplorerOpenFileEvent[] = []
    emitter.onOpenFile(e => opened.push(e))
    rpc.setHandler(Endpoints.gitStatus, () => Promise.resolve({ ok: true, value: mixedStatus() }))
    rpc.setHandler(Endpoints.gitLog, () => Promise.resolve({ ok: true, value: emptyLogResult }))
    renderGitTab(rpc, emitter)
    const user = userEvent.setup()

    await screen.findByText('c.txt')
    await user.dblClick(screen.getByText('c.txt'))

    expect(opened).toHaveLength(1)
    expect(opened[0]?.path).toBe('/workspace/repo/new/c.txt')
    expect(opened[0]?.name).toBe('c.txt')
    expect(opened[0]?.kind).toBe('file')
    // Untracked files have no tracked base to diff: the editor shows raw content.
    expect(opened[0]?.diff).toBeUndefined()
  })

  it('stages a row: calls git/stage with [path] then refetches status', async () => {
    const rpc = new FakeRpc()
    rpc.setHandler(Endpoints.gitStatus, () => Promise.resolve({ ok: true, value: mixedStatus() }))
    rpc.setHandler(Endpoints.gitLog, () => Promise.resolve({ ok: true, value: emptyLogResult }))
    rpc.setHandler(Endpoints.gitStage, () => Promise.resolve({ ok: true, value: null }))
    renderGitTab(rpc)

    await screen.findByText('b.txt')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'stage b.txt' }))

    await waitFor(() => {
      const stage = rpc.calls.find(c => c.endpoint === Endpoints.gitStage)
      expect(stage).toBeTruthy()
      expect(stage?.payload).toEqual({ path: ROOT, files: ['b.txt'] })
    })
    const stageIdx = rpc.calls.findIndex(c => c.endpoint === Endpoints.gitStage)
    await waitFor(() => {
      expect(rpc.calls.some((c, i) => i > stageIdx && c.endpoint === Endpoints.gitStatus)).toBe(true)
    })
  })

  it('renders the not-a-repo empty state with the root and retries on demand', async () => {
    const rpc = new FakeRpc()
    rpc.setHandler(Endpoints.gitStatus, () => Promise.resolve(errStatus('not-a-repo', 'not a git repo')))
    rpc.setHandler(Endpoints.gitLog, () => Promise.resolve(errLog('not-a-repo', 'not a git repo')))
    renderGitTab(rpc)

    await screen.findByText('notARepo')
    expect(screen.getByText('/workspace/repo')).toBeTruthy()
    const before = rpc.calls.filter(c => c.endpoint === Endpoints.gitStatus).length
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'errorRetry' }))
    await waitFor(() => {
      expect(rpc.calls.filter(c => c.endpoint === Endpoints.gitStatus).length).toBeGreaterThan(before)
    })
  })

  it('recovers from a not-a-repo state after the directory becomes a repo (S1 regression)', async () => {
    const rpc = new FakeRpc()
    // First probe round: not a repo; after the retry click, the repo exists.
    let repoReady = false
    rpc.setHandler(Endpoints.gitStatus, () => {
      if (!repoReady) return Promise.resolve(errStatus('not-a-repo', 'not a git repo'))
      return Promise.resolve({ ok: true, value: emptyStatus })
    })
    rpc.setHandler(Endpoints.gitLog, () => {
      if (!repoReady) return Promise.resolve(errLog('not-a-repo', 'not a git repo'))
      return Promise.resolve({ ok: true, value: emptyLogResult })
    })
    renderGitTab(rpc)

    await screen.findByText('notARepo')
    const user = userEvent.setup()
    repoReady = true
    await user.click(screen.getByRole('button', { name: 'errorRetry' }))
    // The full-tab error must disappear — the panel returns to the loaded view.
    await waitFor(() => {
      expect(screen.queryByText('notARepo')).toBeNull()
    })
    expect(screen.getByRole('button', { name: 'refresh' })).toBeTruthy()
  })

  it('surfaces a failed stage action in a banner (S4 regression)', async () => {
    const rpc = new FakeRpc()
    rpc.setHandler(Endpoints.gitStatus, () => Promise.resolve({ ok: true, value: mixedStatus() }))
    rpc.setHandler(Endpoints.gitLog, () => Promise.resolve({ ok: true, value: emptyLogResult }))
    rpc.setHandler(Endpoints.gitStage, () => Promise.resolve({ ok: false, error: { code: 'git-failed', message: 'git add exploded', stderrTail: 'x' } }))
    renderGitTab(rpc)

    await screen.findByText('b.txt')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'stage b.txt' }))
    await screen.findByText('git add exploded')
  })

  it('renders the git-missing error state', async () => {
    const rpc = new FakeRpc()
    rpc.setHandler(Endpoints.gitStatus, () => Promise.resolve(errStatus('git-missing', 'git not found')))
    rpc.setHandler(Endpoints.gitLog, () => Promise.resolve(errLog('git-missing', 'git not found')))
    renderGitTab(rpc)

    await screen.findByText('gitMissing')
    expect(screen.getByText('gitMissingHint')).toBeTruthy()
  })

  it('refreshing aborts the previous in-flight request signal', async () => {
    const rpc = new FakeRpc()
    const pendingStatus = deferred<SidebarResult<GitStatusResult>>()
    const pendingLog = deferred<SidebarResult<GitLogResult>>()
    rpc.setHandler(Endpoints.gitStatus, () => pendingStatus.promise)
    rpc.setHandler(Endpoints.gitLog, () => pendingLog.promise)
    renderGitTab(rpc)

    await waitFor(() => {
      expect(rpc.calls.some(c => c.endpoint === Endpoints.gitStatus)).toBe(true)
      expect(rpc.calls.some(c => c.endpoint === Endpoints.gitLog)).toBe(true)
    })
    const firstStatus = rpc.calls.find(c => c.endpoint === Endpoints.gitStatus)
    const firstLog = rpc.calls.find(c => c.endpoint === Endpoints.gitLog)
    expect(firstStatus?.signal?.aborted).toBe(false)
    expect(firstLog?.signal?.aborted).toBe(false)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'refresh' }))

    await waitFor(() => {
      expect(firstStatus?.signal?.aborted).toBe(true)
      expect(firstLog?.signal?.aborted).toBe(true)
    })
    pendingStatus.resolve({ ok: true, value: mixedStatus() })
    pendingLog.resolve({ ok: true, value: emptyLogResult })
  })

  it('renders an inline banner with a retry for a transient status error', async () => {
    const rpc = new FakeRpc()
    const d = deferred<SidebarResult<GitStatusResult>>()
    rpc.setHandler(Endpoints.gitStatus, () => d.promise)
    rpc.setHandler(Endpoints.gitLog, () => Promise.resolve({ ok: true, value: emptyLogResult }))
    renderGitTab(rpc)
    d.resolve({
      ok: false,
      error: { code: 'timeout', message: 'git status timed out', command: 'status' },
    })
    await screen.findByText('git status timed out')
  })
  it('commits staged changes with a typed message (calls git/commit)', async () => {
    const rpc = new FakeRpc()
    rpc.setHandler(Endpoints.gitStatus, () => Promise.resolve({ ok: true, value: mixedStatus() }))
    rpc.setHandler(Endpoints.gitLog, () => Promise.resolve({ ok: true, value: emptyLogResult }))
    rpc.setHandler(Endpoints.gitCommit, () => Promise.resolve({ ok: true, value: { hash: 'e'.repeat(40) } }))
    renderGitTab(rpc)
    const user = userEvent.setup()

    // Composer appears with the message input (placeholder key rendered verbatim).
    await screen.findByPlaceholderText('commitPlaceholder')
    const input = screen.getByPlaceholderText('commitPlaceholder')
    await user.type(input, 'fix the bug')
    const commitBtn = screen.getByRole('button', { name: 'commit' })
    expect((commitBtn as HTMLButtonElement).disabled).toBe(false)

    await user.click(commitBtn)
    await waitFor(() => {
      const call = rpc.calls.find(c => c.endpoint === Endpoints.gitCommit)
      expect(call).toBeTruthy()
      expect(call?.payload).toEqual({ path: ROOT, message: 'fix the bug', files: [] })
    })
  })

  it('commits ALL changes when "include all" is checked (pre-stages the files)', async () => {
    const rpc = new FakeRpc()
    rpc.setHandler(Endpoints.gitStatus, () => Promise.resolve({ ok: true, value: mixedStatus() }))
    rpc.setHandler(Endpoints.gitLog, () => Promise.resolve({ ok: true, value: emptyLogResult }))
    rpc.setHandler(Endpoints.gitCommit, () => Promise.resolve({ ok: true, value: { hash: 'e'.repeat(40) } }))
    renderGitTab(rpc)
    const user = userEvent.setup()

    await screen.findByPlaceholderText('commitPlaceholder')
    await user.type(screen.getByPlaceholderText('commitPlaceholder'), 'include everything')
    await user.click(screen.getByText('commitAll'))
    await user.click(screen.getByRole('button', { name: 'commit' }))

    await waitFor(() => {
      const call = rpc.calls.find(c => c.endpoint === Endpoints.gitCommit)
      expect(call?.payload).toEqual({ path: ROOT, message: 'include everything', files: ['a.txt', 'b.txt', 'new/c.txt'] })
    })
  })

  it('commits with include-all unchecked is disabled when nothing is staged', async () => {
    const rpc = new FakeRpc()
    const onlyUnstaged: GitStatusResult = {
      staged: [], unstaged: [entry({ xy: ' M', path: 'b.txt', unstaged: true })],
      untracked: [], conflicted: [], truncated: false, head: 'main',
    }
    rpc.setHandler(Endpoints.gitStatus, () => Promise.resolve({ ok: true, value: onlyUnstaged }))
    rpc.setHandler(Endpoints.gitLog, () => Promise.resolve({ ok: true, value: emptyLogResult }))
    renderGitTab(rpc)
    const user = userEvent.setup()

    await screen.findByPlaceholderText('commitPlaceholder')
    await user.type(screen.getByPlaceholderText('commitPlaceholder'), 'message')
    // Nothing staged and "include all" is off -> cannot commit.
    expect((screen.getByRole('button', { name: 'commit' }) as HTMLButtonElement).disabled).toBe(true)
    // Toggling include-all enables it.
    await user.click(screen.getByText('commitAll'))
    expect((screen.getByRole('button', { name: 'commit' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('discards a single row after confirm (calls git/discard)', async () => {
    const origConfirm = window.confirm
    window.confirm = () => true
    try {
      const rpc = new FakeRpc()
      rpc.setHandler(Endpoints.gitStatus, () => Promise.resolve({ ok: true, value: mixedStatus() }))
      rpc.setHandler(Endpoints.gitLog, () => Promise.resolve({ ok: true, value: emptyLogResult }))
      rpc.setHandler(Endpoints.gitDiscard, () => Promise.resolve({ ok: true, value: null }))
      // After discard the parent calls refreshStatus -> git/status. Keep
      // returning mixedStatus so the row stays findable for the assertion.
      renderGitTab(rpc)
      const user = userEvent.setup()

      await screen.findByText('b.txt')
      await user.click(screen.getByRole('button', { name: 'discard b.txt' }))

      await waitFor(() => {
        const call = rpc.calls.find(c => c.endpoint === Endpoints.gitDiscard)
        expect(call).toBeTruthy()
        expect(call?.payload).toEqual({ path: ROOT, files: ['b.txt'] })
      })
    } finally {
      window.confirm = origConfirm
    }
  })

  describe('auto-refresh', () => {
    afterEach(() => { vi.useRealTimers() })

    const statusCount = (rpc: FakeRpc): number => rpc.calls.filter(c => c.endpoint === Endpoints.gitStatus).length
    const logCount = (rpc: FakeRpc): number => rpc.calls.filter(c => c.endpoint === Endpoints.gitLog).length

    it('polls status on the fallback interval and keeps the log until status changes', async () => {
      vi.useFakeTimers()
      const rpc = new FakeRpc()
      rpc.setHandler(Endpoints.gitStatus, () => Promise.resolve({ ok: true, value: mixedStatus() }))
      rpc.setHandler(Endpoints.gitLog, () => Promise.resolve({ ok: true, value: emptyLogResult }))
      renderGitTab(rpc)
      // Mount refresh settles.
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(statusCount(rpc)).toBe(1)
      expect(logCount(rpc)).toBe(1)

      // One poll tick later the status is refetched...
      await act(async () => { await vi.advanceTimersByTimeAsync(SETTINGS_DEFAULTS.gitPollMs) })
      await act(async () => {})
      expect(statusCount(rpc)).toBe(2)
      // ...but the unchanged status does not drag the log along.
      expect(logCount(rpc)).toBe(1)
    })

    it('refetches the log when a poll sees the working tree change', async () => {
      vi.useFakeTimers()
      const rpc = new FakeRpc()
      let clean = false
      rpc.setHandler(Endpoints.gitStatus, () => Promise.resolve({ ok: true, value: clean ? emptyStatus : mixedStatus() }))
      rpc.setHandler(Endpoints.gitLog, () => Promise.resolve({ ok: true, value: emptyLogResult }))
      renderGitTab(rpc)
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(logCount(rpc)).toBe(1)

      // The tree becomes clean between polls (e.g. an external commit).
      clean = true
      await act(async () => { await vi.advanceTimersByTimeAsync(SETTINGS_DEFAULTS.gitPollMs) })
      await act(async () => {})
      expect(logCount(rpc)).toBe(2)
    })

    it('auto-refreshes once, debounced, after the active session bumps updatedAt', async () => {
      vi.useFakeTimers()
      const rpc = new FakeRpc()
      rpc.setHandler(Endpoints.gitStatus, () => Promise.resolve({ ok: true, value: mixedStatus() }))
      rpc.setHandler(Endpoints.gitLog, () => Promise.resolve({ ok: true, value: emptyLogResult }))
      // Mutable sessions snapshot so the test can simulate a session update.
      const sessionsRef: { value: SessionListState } = { value: SESSIONS }
      const value: DockContextValue = {
        rpc,
        useSessions: ((sel: (s: SessionListState) => unknown) => sel(sessionsRef.value)) as SnapshotSelectorHook<SessionListState>,
        useWorkspaces: fixedHook(WORKSPACES),
        // A far-out fallback poll isolates the dirty-signal debounce: the poll
        // must not fire while the debounce window is still open.
        settings: fakeSettingsScope({ gitPollMs: 8000 }),
      }
      const { rerender } = render(
        <DockContext.Provider value={value}>
          <GitTab rpc={rpc} emitter={new ExplorerOpenFileEmitter()} t={t} />
        </DockContext.Provider>,
      )
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      expect(statusCount(rpc)).toBe(1)

      // A tool result lands: the session summary bumps its activity stamp.
      const summaries = SESSIONS.byId as unknown as Record<string, { updatedAt: number }>
      sessionsRef.value = {
        ...SESSIONS,
        byId: { s1: { ...summaries.s1, updatedAt: 1 } },
      } as unknown as SessionListState
      rerender(
        <DockContext.Provider value={value}>
          <GitTab rpc={rpc} emitter={new ExplorerOpenFileEmitter()} t={t} />
        </DockContext.Provider>,
      )
      // Debounce has not elapsed yet -> no refresh.
      await act(async () => { await vi.advanceTimersByTimeAsync(AUTO_REFRESH_DEBOUNCE_MS - 1) })
      expect(statusCount(rpc)).toBe(1)
      // Once the debounce elapses, exactly one refresh runs.
      await act(async () => { await vi.advanceTimersByTimeAsync(2) })
      await act(async () => {})
      expect(statusCount(rpc)).toBe(2)
    })
  })

})