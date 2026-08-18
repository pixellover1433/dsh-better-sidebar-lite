import type { SnapshotSelectorHook, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionListState, WorkspaceListState, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import type { BetterSidebarRpc } from '../rpc-client.ts';
import type { BetterSidebarSettings } from '../../contract/settings.ts';
import type { ExplorerEvents } from '../tabs/explorer/events.ts';
import type { BetterSidebarTabRegistry } from '../tab-registry/contract.ts';
/** Window event the plugin's global shortcut dispatches to flip the dock. */
export declare const TOGGLE_EVENT = "better-sidebar:toggle";
/** The layout face subset the dock drives (open/close the details column). */
export interface DockLayoutActions {
    openDetails(): void;
    closeDetails(): void;
}
/** Persisted open/closed preference key (the column width lives in the layout store). */
export declare const DOCK_STORAGE_KEY = "dsh.betterSidebar.dock";
export interface DockRootProps {
    useSessions: SnapshotSelectorHook<SessionListState>;
    useWorkspaces: SnapshotSelectorHook<WorkspaceListState>;
    rpc: BetterSidebarRpc;
    tabs: BetterSidebarTabRegistry;
    /** Shared open-file event source (explorer + git); the modal editor consumes it. */
    events: ExplorerEvents;
    /** Bound plugin settings scope (user-editable via Settings > Plugins); undefined when the seam is absent. */
    settings: SettingsScope<BetterSidebarSettings> | undefined;
    /** Localized shell copy (plugin passes ctx.locale.bind(NS)). */
    t: TranslateNS<'betterSidebar.dock'>;
    /** Details-column panel actions (open/close the sidebar). */
    layout: DockLayoutActions;
}
export declare function DockRoot({ useSessions, useWorkspaces, rpc, tabs, events, settings, t, layout }: DockRootProps): JSX.Element;
/** The details-column entry component (ADR-001): a closure over the injected
 * services that forwards the framework's global props to DockRoot. Lives here
 * (a .tsx module) so the .ts plugin entry never embeds JSX.
 */
export declare function createDockEntry(services: {
    rpc: BetterSidebarRpc;
    tabs: BetterSidebarTabRegistry;
    events: ExplorerEvents;
    settings: SettingsScope<BetterSidebarSettings> | undefined;
    t: TranslateNS<'betterSidebar.dock'>;
    layout: DockLayoutActions;
}): (props: DockRootPropsWithoutServices) => JSX.Element;
/** The global-only slice of DockRoot props the slot framework supplies. */
export interface DockRootPropsWithoutServices {
    useSessions: DockRootProps['useSessions'];
    useWorkspaces: DockRootProps['useWorkspaces'];
}
//# sourceMappingURL=dock.d.ts.map