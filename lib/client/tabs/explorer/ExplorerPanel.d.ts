import type { BetterSidebarRpc } from '../../rpc-client.ts';
import type { ExplorerOpenFileEmitter } from './events.ts';
import type { ExplorerKey } from './locales.ts';
/**
 * Fallback poll cadence (ADR-004 §3 amendment, explorer): catches tree-visible
 * changes that never touch the session store (IDE, terminal, other processes).
 * The sweep itself is cheap — a handful of directory stats via explorer/stamp —
 * and only changed directories are re-listed.
 */
export declare const AUTO_REFRESH_EXPLORER_INTERVAL_MS = 8000;
/**
 * Debounce for session-activity-triggered auto-refresh. Session frames (and
 * their updatedAt bumps) arrive in bursts around one tool run, so coalesce
 * them into a single refresh — mirrors the git tab's debounce.
 */
export declare const AUTO_REFRESH_EXPLORER_DEBOUNCE_MS = 600;
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