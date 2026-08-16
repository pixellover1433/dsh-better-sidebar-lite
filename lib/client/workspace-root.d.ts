/**
 * Pure root-resolution selector shared by the explorer and git tabs (ADR-004):
 * active session cwd -> current workspace -> recent/only workspace -> none.
 */
import type { SessionListState } from '@deepseek-ai/dsh-client-runtime/client';
import type { WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client';
/**
 * Resolve the directory the tabs should show.
 * @returns absolute path, or undefined when no workspace exists (empty state).
 */
export declare function resolveRoot(sessions: SessionListState, workspaces: WorkspaceListState): string | undefined;
//# sourceMappingURL=workspace-root.d.ts.map