import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { BetterSidebarRpc } from '../rpc-client.ts';
import type { ExplorerEvents } from '../tabs/explorer/events.ts';
export interface FileModalEditorProps {
    /** Typed RPC facade (the only way the client talks to the host). */
    rpc: BetterSidebarRpc;
    /** The shared open-file event source (explorer and git both emit into it). */
    events: ExplorerEvents;
    /** Bound dock-namespace translate (locale-aware copy). */
    t: TranslateNS<'betterSidebar.dock'>;
}
/**
 * The sidebar-wide file modal. Subscribes to open-file events once per mount
 * and supersedes an in-flight read when a newer open arrives, so rapid
 * double-clicks always settle on the last-opened file.
 */
export declare function FileModalEditor({ rpc, events, t }: FileModalEditorProps): JSX.Element | null;
//# sourceMappingURL=FileModalEditor.d.ts.map