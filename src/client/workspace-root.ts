/**
 * Pure root-resolution selector shared by the explorer and git tabs (ADR-004):
 * active session cwd -> current workspace -> recent/only workspace -> none.
 */
import type { SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'

/**
 * Resolve the directory the tabs should show.
 * @returns absolute path, or undefined when no workspace exists (empty state).
 */
export function resolveRoot(sessions: SessionListState, workspaces: WorkspaceListState): string | undefined {
  const active = sessions.current === undefined ? undefined : sessions.byId[sessions.current]
  if (active?.cwd !== undefined) return active.cwd
  if (workspaces.items.length === 1) return workspaces.items[0]?.path
  if (workspaces.recentWorkspaceId !== undefined) {
    const recent = workspaces.items.find(w => w.workspaceId === workspaces.recentWorkspaceId)
    if (recent !== undefined) return recent.path
  }
  return undefined
}