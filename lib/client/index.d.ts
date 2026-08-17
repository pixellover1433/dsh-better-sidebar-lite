/**
 * Client plugin entry (client-core): contributes the right-docked sidebar as
 * the frame's 'details' column occupant, provides ctx.betterSidebar,
 * registers the dock + built-in tab locales, wires the built-in explorer/git
 * tabs onto the tab registry, and binds the Ctrl/Cmd+Shift+B toggle.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import type { BetterSidebarRpc } from './rpc-client.ts';
import type { BetterSidebarTabRegistry as TabRegistryFace } from './tab-registry/contract.ts';
import type { ExplorerEvents } from './tabs/explorer/events.ts';
/** Cross-plugin service face (ADR-001). */
export interface BetterSidebarService {
    rpc: BetterSidebarRpc;
    tabs: TabRegistryFace;
    explorer: ExplorerEvents;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Right-column sidebar facade: RPC + tab registry + open-file events. */
        betterSidebar: BetterSidebarService;
        /** Generic logical RPC channel handle (client half provides this at runtime). */
        connection: ConnectionHandle;
    }
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        /**
         * Mirror of ui-sidebar's declaration (that package is not installed in
         * this workspace): optional actions beside Settings at the sidebar foot.
         * Kind/scope/owner match ui-sidebar's contract/slots.ts verbatim.
         */
        'sidebar.footer.action': {
            kind: 'list';
            scope: 'root';
            owner: {
                wide: boolean;
            };
        };
    }
}
/** Required services. `settingsScope` is optional (present when ui-settings is
 * composed); when absent the tabs keep their built-in defaults and no card is
 * registered into Settings > Plugins. */
export declare const inject: string[];
/**
 * Client plugin body: provide ctx.betterSidebar, register shell + built-in
 * locales, register the built-in tabs, register the dock into the frame's
 * 'details' column, and bind the global toggle shortcut. Every registration
 * is disposed (LIFO)
 * on fiber teardown for HMR safety.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map