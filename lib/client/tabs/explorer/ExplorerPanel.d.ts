import type { BetterSidebarRpc } from '../../rpc-client.ts';
import type { ExplorerOpenFileEmitter } from './events.ts';
import type { ExplorerKey } from './locales.ts';
export interface ExplorerPanelProps {
    /** Typed RPC facade (explicit prop; the dock shell wires it into the tab factory). */
    rpc: BetterSidebarRpc;
    /** Open-file emitter (future editors subscribe; D2 §10). */
    emitter: ExplorerOpenFileEmitter;
    /** Bound explorer-namespace translate (locale-aware copy). */
    t: (key: ExplorerKey) => string;
}
/**
 * Explorer tab panel (D2): resolves the workspace root, owns an ExplorerStore,
 * and renders the tree with WebAIM roving-tabindex semantics. The includeHidden
 * toggle is deliberately DEFERRED (the contract shares no hidden flag and the
 * host always filters) — no toggle is rendered.
 */
export declare function ExplorerPanel({ rpc, emitter, t }: ExplorerPanelProps): import("react").JSX.Element;
//# sourceMappingURL=ExplorerPanel.d.ts.map