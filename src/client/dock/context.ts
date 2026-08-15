/**
 * React context the dock provides around every tab panel (ADR-003): tabs
 * consume session/workspace hooks and the RPC facade through useDock() —
 * the framework-free test seam.
 */
import { createContext, useContext } from 'react'
import type {
  SessionListState, WorkspaceListState,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { BetterSidebarRpc } from '../rpc-client.ts'

export interface DockContextValue {
  /** Typed RPC facade (ADR-002). */
  readonly rpc: BetterSidebarRpc
  /** Global session-list hook (standard global-slot prop). */
  readonly useSessions: SnapshotSelectorHook<SessionListState>
  /** Global workspace-list hook (standard global-slot prop). */
  readonly useWorkspaces: SnapshotSelectorHook<WorkspaceListState>
}

export const DockContext = createContext<DockContextValue | undefined>(undefined)

/** Read the dock-provided context; throws outside a mounted dock. */
export function useDock(): DockContextValue {
  const value = useContext(DockContext)
  if (value === undefined) throw new Error('useDock: no DockContext provider (tab rendered outside the dock)')
  return value
}
