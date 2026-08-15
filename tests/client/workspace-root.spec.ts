/**
 * resolveRoot precedence tests (ADR-004): active session cwd -> single
 * workspace -> recentWorkspaceId -> undefined. Pure selector, no React.
 */
import { describe, expect, it } from 'vitest'
import { resolveRoot } from '../../src/client/workspace-root.ts'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkspaceListState, WorkspaceView } from '@deepseek-ai/dsh-client-runtime/client'

function session(id: string, cwd?: string): SessionSummary {
  return { id, displayTitle: id, running: false, cwd } as SessionSummary
}

function sessions(current: string | undefined, byIdList: SessionSummary[]): SessionListState {
  const byId: Record<string, SessionSummary> = {}
  for (const s of byIdList) byId[s.id] = s
  return {
    ids: byIdList.map(s => s.id),
    byId,
    current,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  } as SessionListState
}

function workspace(id: string, path: string): WorkspaceView {
  return { workspaceId: id, path } as WorkspaceView
}

function workspaces(items: WorkspaceView[], recentWorkspaceId?: string): WorkspaceListState {
  return {
    items,
    archivedSessionIds: [],
    state: 'idle',
    phase: 'ready',
    error: null,
    baselinesReady: true,
    recentWorkspaceId,
  } as WorkspaceListState
}

describe('resolveRoot', () => {
  it('prefers the active session cwd over workspaces', () => {
    const s = sessions('s1', [session('s1', '/session/cwd'), session('s2', '/other')])
    const w = workspaces([workspace('w1', '/workspace')])
    expect(resolveRoot(s, w)).toBe('/session/cwd')
  })

  it('falls back to the single workspace when no session is current', () => {
    const s = sessions(undefined, [])
    const w = workspaces([workspace('w1', '/workspace')])
    expect(resolveRoot(s, w)).toBe('/workspace')
  })

  it('falls back to the single workspace when the current session has no cwd', () => {
    const s = sessions('s1', [session('s1')])
    const w = workspaces([workspace('w1', '/workspace')])
    expect(resolveRoot(s, w)).toBe('/workspace')
  })

  it('prefers the single workspace over the recentWorkspaceId', () => {
    const s = sessions(undefined, [])
    const w = workspaces(
      [workspace('w1', '/w1'), workspace('w2', '/w2')],
      'w1',
    )
    // two workspaces: no "single", so recentWorkspaceId resolves
    expect(resolveRoot(s, w)).toBe('/w1')
  })

  it('uses recentWorkspaceId when multiple workspaces exist', () => {
    const s = sessions(undefined, [])
    const w = workspaces(
      [workspace('a', '/a'), workspace('b', '/b'), workspace('c', '/c')],
      'b',
    )
    expect(resolveRoot(s, w)).toBe('/b')
  })

  it('returns undefined when no source resolves', () => {
    const s = sessions(undefined, [])
    const w = workspaces([])
    expect(resolveRoot(s, w)).toBeUndefined()
  })

  it('returns undefined when recentWorkspaceId points at nothing', () => {
    const s = sessions(undefined, [])
    const w = workspaces([workspace('a', '/a')], 'ghost')
    // single workspace present, but the recent id is stale -> single wins
    expect(resolveRoot(s, w)).toBe('/a')
  })
})
