/**
 * Skills tab component tests: framework-free — SkillsTab is rendered inside a
 * DockContext.Provider with a stub rpc and stub session/workspace hooks (the
 * skills tab is session- and workspace-aware: it resolves the active workspace
 * root and sends it as the required cwd to skills/list, plus the active
 * sessionId when present, so the host performs a cwd-sensitive lookup; with no
 * resolvable root it shows the no-workspace empty state and skips the call).
 * No dsh test-runtime, no Cordis mount.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SessionListState, WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { SkillEntry, SkillDetailResult } from '../../../../src/contract/skills.ts'
import type { SidebarError, SidebarResult } from '../../../../src/contract/errors.ts'
import { Endpoints, type BetterSidebarEndpoint, type BetterSidebarReqMap, type BetterSidebarResMap } from '../../../../src/contract/rpc.ts'
import type { BetterSidebarRpc } from '../../../../src/client/rpc-client.ts'
import { DockContext, type DockContextValue } from '../../../../src/client/dock/context.ts'
import { skillStatus, SkillsTab, type SkillsTabProps } from '../../../../src/client/tabs/skills/SkillsTab.tsx'
import { SETTINGS_DEFAULTS } from '../../../../src/contract/settings.ts'

/** Locale stub: render keys verbatim so assertions read the raw key. */
const t: SkillsTabProps['t'] = (key) => key

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

/** Sessions snapshot with no active session and no cwd (no resolvable root). */
const NO_SESSIONS = {
  ids: [],
  byId: {},
  current: undefined,
  phase: 'ready',
  subagentsByParent: {},
  jobsBySession: {},
  currentAddress: undefined,
} as unknown as SessionListState

/** Build a SnapshotSelectorHook stub that returns a fixed state for any selector. */
function fixedHook<V>(value: V): SnapshotSelectorHook<V> {
  return ((sel: (s: V) => unknown) => sel(value)) as SnapshotSelectorHook<V>
}

/** Build a fake SkillEntry over defaults. */
function entry(overrides: Partial<SkillEntry> & { name: string }): SkillEntry {
  return {
    description: 'desc',
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'bundled',
    provider: 'p',
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

afterEach(() => cleanup())

function renderSkillsTab(
  rpc: BetterSidebarRpc,
  options?: { sessions?: SessionListState; workspaces?: WorkspaceListState },
): void {
  const value: DockContextValue = {
    rpc,
    useSessions: fixedHook(options?.sessions ?? SESSIONS),
    useWorkspaces: fixedHook(options?.workspaces ?? WORKSPACES),
    settings: undefined,
  }
  render(
    <DockContext.Provider value={value}>
      <SkillsTab rpc={rpc} t={t} />
    </DockContext.Provider>,
  )
}

describe('SkillsTab', () => {
  it('renders names, descriptions, and status chips for a mixed list', async () => {
    const rpc = new FakeRpc()
    rpc.setHandler(Endpoints.skillsList, () => Promise.resolve({
      ok: true,
      value: {
        skills: [
          entry({ name: 'alpha', description: 'Alpha thing' }),
          entry({ name: 'beta', invocation: { modelInvocable: false, userInvocable: false } }),
          entry({ name: 'gamma', invocation: { modelInvocable: true, userInvocable: false } }),
          entry({ name: 'delta', invocation: { modelInvocable: false, userInvocable: true } }),
        ],
      },
    }))
    renderSkillsTab(rpc)

    await screen.findByText('alpha')
    expect(screen.getByText('Alpha thing')).toBeTruthy()
    expect(screen.getByText('beta')).toBeTruthy()
    expect(screen.getByText('gamma')).toBeTruthy()
    expect(screen.getByText('delta')).toBeTruthy()
    // The localized status text is rendered verbatim (keys as the stub returns).
    expect(screen.getByText('statusEnabled')).toBeTruthy()
    expect(screen.getByText('statusDisabled')).toBeTruthy()
    expect(screen.getByText('statusModelOnly')).toBeTruthy()
    expect(screen.getByText('statusUserOnly')).toBeTruthy()
    // The request carries the resolved workspace root as the required cwd plus
    // the active session id, so the host lookup is cwd-sensitive and scoped.
    await waitFor(() => {
      const call = rpc.calls.find(c => c.endpoint === Endpoints.skillsList)
      expect(call).toBeTruthy()
      expect(call?.payload).toEqual({ cwd: ROOT, sessionId: 's1' })
    })
  })

  it('shows the empty state for an empty catalog', async () => {
    const rpc = new FakeRpc()
    rpc.setHandler(Endpoints.skillsList, () => Promise.resolve({ ok: true, value: { skills: [] } }))
    renderSkillsTab(rpc)

    await screen.findByText('emptyTitle')
    expect(screen.getByText('emptyHint')).toBeTruthy()
  })

  it('shows a load error with a retry, and retrying recovers into the list', async () => {
    const rpc = new FakeRpc()
    let failing = true
    rpc.setHandler(Endpoints.skillsList, () => {
      if (failing) return Promise.resolve({ ok: false, error: { code: 'internal', message: 'boom' } as SidebarError })
      return Promise.resolve({ ok: true, value: { skills: [entry({ name: 'alpha' })] } })
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      renderSkillsTab(rpc)

      await screen.findByText('errorTitle')
      // The initial (domain-error) load is logged to the browser console with
      // the full received object, so a broken tab is diagnosable.
      expect(consoleError).toHaveBeenCalledWith(
        'better-sidebar: skills/list failed',
        JSON.stringify({ ok: false, error: { code: 'internal', message: 'boom' } }),
      )
      expect(screen.getByRole('button', { name: 'errorRetry' })).toBeTruthy()

      failing = false
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'errorRetry' }))

      await waitFor(() => {
        expect(screen.queryByText('errorTitle')).toBeNull()
      })
      await screen.findByText('alpha')
    } finally {
      consoleError.mockRestore()
    }
  })

  it('shows the no-workspace state and skips the call when no root resolves', async () => {
    const rpc = new FakeRpc()
    rpc.setHandler(Endpoints.skillsList, () => Promise.resolve({ ok: true, value: { skills: [entry({ name: 'alpha' })] } }))
    renderSkillsTab(rpc, { sessions: NO_SESSIONS })

    // No active session cwd and no resolvable workspace -> the empty state is
    // shown and no skills/list call is issued (cwd is mandatory on the wire).
    await screen.findByText('noWorkspace')
    expect(screen.getByText('noWorkspaceHint')).toBeTruthy()
    await waitFor(() => {
      expect(rpc.calls.filter(c => c.endpoint === Endpoints.skillsList)).toHaveLength(0)
    })
  })

  it('renders a listing warning hint and stays in the loaded/empty state', async () => {
    const rpc = new FakeRpc()
    rpc.setHandler(Endpoints.skillsList, () => Promise.resolve({
      ok: true,
      value: { skills: [], warning: 'skills/list failed: boom' },
    }))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      renderSkillsTab(rpc)

      // The warning text and its label are shown above the empty catalog.
      await screen.findByText('skills/list failed: boom')
      expect(screen.getByText('warningTitle')).toBeTruthy()
      // Listing failures are not hard errors: the empty/loaded state remains.
      expect(screen.queryByText('errorTitle')).toBeNull()
      expect(screen.getByText('emptyTitle')).toBeTruthy()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('re-polls silently on the fallback cadence so recently-injected skills appear without blanking the list', async () => {
    vi.useFakeTimers()
    try {
      const rpc = new FakeRpc()
      rpc.setHandler(Endpoints.skillsList, () => Promise.resolve({ ok: true, value: { skills: [entry({ name: 'alpha' })] } }))
      renderSkillsTab(rpc)

      // Flush the initial mount fetch and its async state update.
      await act(async () => {})
      expect(screen.getByText('alpha')).toBeTruthy()

      const initial = rpc.calls.filter(c => c.endpoint === Endpoints.skillsList)
      expect(initial).toHaveLength(1)

      // A full cadence elapses: the poll re-fetches the same payload (silent),
      // and the already-loaded list stays rendered — no loading spinner.
      act(() => { vi.advanceTimersByTime(SETTINGS_DEFAULTS.skillsPollMs) })
      await act(async () => {})

      const calls = rpc.calls.filter(c => c.endpoint === Endpoints.skillsList)
      expect(calls).toHaveLength(2)
      expect(calls[1]?.payload).toEqual({ cwd: ROOT, sessionId: 's1' })
      expect(screen.getByText('alpha')).toBeTruthy()
      expect(screen.queryByText('loading')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('double-clicking a row opens the detail view with the loaded content and references', async () => {
    const rpc = new FakeRpc()
    rpc.setHandler(Endpoints.skillsList, () => Promise.resolve({
      ok: true,
      value: { skills: [entry({ name: 'alpha', description: 'Alpha thing' })] },
    }))
    const detail: SkillDetailResult = {
      found: true,
      name: 'alpha',
      description: 'Alpha detail desc',
      invocation: { modelInvocable: true, userInvocable: true },
      source: 'bundled',
      provider: 'runtime',
      content: '# Alpha\nBody content',
      path: `${ROOT}/.dsh/skills/alpha/SKILL.md`,
      resourceDir: `${ROOT}/.dsh/skills/alpha`,
      references: [
        { name: 'guide.md', path: `${ROOT}/.dsh/skills/alpha/guide.md`, kind: 'file' },
        { name: 'references/notes.md', path: `${ROOT}/.dsh/skills/alpha/references/notes.md`, kind: 'file' },
      ],
    }
    rpc.setHandler(Endpoints.skillsDetail, () => Promise.resolve({ ok: true, value: detail }))
    renderSkillsTab(rpc)

    await screen.findByText('alpha')
    const user = userEvent.setup()
    await user.dblClick(screen.getByText('alpha'))

    // The detail request carries the skill name, the workspace cwd, and the
    // active session id so the host performs a cwd-sensitive scoped lookup.
    await waitFor(() => {
      const call = rpc.calls.find(c => c.endpoint === Endpoints.skillsDetail)
      expect(call).toBeTruthy()
      expect(call?.payload).toEqual({ name: 'alpha', cwd: ROOT, sessionId: 's1' })
    })

    // The loaded SKILL.md body and the sibling references render. (getByText
    // normalizes whitespace, so the embedded newline reads as a single space.)
    await screen.findByText('# Alpha Body content')
    expect(screen.getByText('Alpha detail desc')).toBeTruthy()
    expect(screen.getByText('guide.md')).toBeTruthy()
    // Nested-file references render their resource-relative name.
    expect(screen.getByText('references/notes.md')).toBeTruthy()
  })

  it('the back button returns from the detail view to the catalog list', async () => {
    const rpc = new FakeRpc()
    rpc.setHandler(Endpoints.skillsList, () => Promise.resolve({
      ok: true,
      value: { skills: [entry({ name: 'alpha', description: 'Alpha thing' })] },
    }))
    rpc.setHandler(Endpoints.skillsDetail, () => Promise.resolve({
      ok: true,
      value: {
        found: true,
        name: 'alpha',
        description: 'Alpha active',
        invocation: { modelInvocable: false, userInvocable: true },
        source: 'bundled',
        provider: 'runtime',
        content: 'detail body',
        references: [{ name: 'guide.md', path: `${ROOT}/.dsh/skills/alpha/guide.md`, kind: 'file' }],
      },
    }))
    renderSkillsTab(rpc)

    await screen.findByText('alpha')
    const user = userEvent.setup()
    await user.dblClick(screen.getByText('alpha'))
    await screen.findByText('detail body')

    await user.click(screen.getByRole('button', { name: 'detailBack' }))

    // The detail is replaced by the catalog list again.
    await waitFor(() => {
      expect(screen.queryByText('detail body')).toBeNull()
    })
    expect(screen.getByText('alpha')).toBeTruthy()
    expect(screen.getByText('Alpha thing')).toBeTruthy()
  })

  it('skillStatus derives the four statuses from the invocation policy', () => {
    expect(skillStatus(entry({ name: 'a' }))).toBe('enabled')
    expect(skillStatus(entry({ name: 'b', invocation: { modelInvocable: false, userInvocable: false } }))).toBe('disabled')
    expect(skillStatus(entry({ name: 'c', invocation: { modelInvocable: true, userInvocable: false } }))).toBe('modelOnly')
    expect(skillStatus(entry({ name: 'd', invocation: { modelInvocable: false, userInvocable: true } }))).toBe('userOnly')
  })
})