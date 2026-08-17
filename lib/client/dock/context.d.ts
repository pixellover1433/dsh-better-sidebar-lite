import type { SessionListState, WorkspaceListState, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots';
import type { BetterSidebarRpc } from '../rpc-client.ts';
import type { BetterSidebarSettings } from '../../contract/settings.ts';
export interface DockContextValue {
    /** Typed RPC facade (ADR-002). */
    readonly rpc: BetterSidebarRpc;
    /** Global session-list hook (standard global-slot prop). */
    readonly useSessions: SnapshotSelectorHook<SessionListState>;
    /** Global workspace-list hook (standard global-slot prop). */
    readonly useWorkspaces: SnapshotSelectorHook<WorkspaceListState>;
    /**
     * The bound plugin settings scope (user-editable via Settings > Plugins).
     * Undefined when the settings seam is not composed; tabs keep their defaults.
     */
    readonly settings: SettingsScope<BetterSidebarSettings> | undefined;
}
export declare const DockContext: import("react").Context<DockContextValue | undefined>;
/** Read the dock-provided context; throws outside a mounted dock. */
export declare function useDock(): DockContextValue;
//# sourceMappingURL=context.d.ts.map