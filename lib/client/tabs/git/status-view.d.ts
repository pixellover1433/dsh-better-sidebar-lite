/**
 * Git status view (ADR-004): four sections in fixed order — Staged, Conflicts,
 * Changes, Untracked — each with a count and optionally a section-level action.
 * Rows render a porcelain glyph, the path (last segment bold), and per-row
 * stage/unstage actions derived from the entry flags. Pure presentational plus
 * the stage/unstage RPC mutation; the parent owns fetch/refresh state.
 */
import type { GitStatusEntry, GitStatusResult } from '../../../contract/git.ts';
import type { BetterSidebarRpc } from '../../rpc-client.ts';
import type { ExplorerOpenFileEmitter } from '../explorer/events.ts';
import type { GitKey } from './locales.ts';
export interface GitStatusViewProps {
    /** Loaded status result (never null). */
    result: GitStatusResult;
    /** Work-tree root sent as the `path` of stage/unstage requests. */
    root: string;
    rpc: BetterSidebarRpc;
    /** Open-file emitter; double-clicking a file row opens it via the shared modal. */
    emitter: ExplorerOpenFileEmitter;
    /** Bound git-namespace translate. */
    t: (key: GitKey, params?: Record<string, unknown>) => string;
    /** Invoked after a successful stage/unstage so the parent refetches status. */
    onChanged: () => void;
    /** Invoked when a stage/unstage action fails (ADR-002 error surfaced). */
    onActionError: (message: string) => void;
    /** Invoked to discard a file's working-tree changes (restore or clean). */
    onDiscard: (entry: GitStatusEntry) => void;
    /** Invoked to discard all unstaged + untracked changes. */
    onDiscardAll: () => void;
}
export type GlyphTone = 'added' | 'modified' | 'deleted' | 'renamed' | 'unmerged' | 'untracked';
export declare function GitStatusView({ result, root, rpc, emitter, t, onChanged, onActionError, onDiscard, onDiscardAll }: GitStatusViewProps): import("react").JSX.Element;
//# sourceMappingURL=status-view.d.ts.map