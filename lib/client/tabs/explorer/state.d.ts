/**
 * ExplorerStore — the explorer tab's single source of tree truth (ADR-004, D2 §6).
 * A plain observable store (listener set + snapshot), deliberately framework-free:
 * the panel binds it via useSyncExternalStore. All transitions are pure and
 * unit-testable without a DOM. Collapse keeps children loaded so re-opening is
 * synchronous; the stale-response guards (per-path request seq + per-tab root
 * generation) discard superseded async results.
 */
import type { ExplorerEntry, ExplorerListResult, ExplorerStampRequest, ExplorerStampResult } from '../../../contract/explorer.ts';
import type { SidebarError, SidebarResult } from '../../../contract/errors.ts';
/** Injected directory listing transport (the panel wires it to the RPC facade). */
export type DirectoryLoader = (path: string, signal: AbortSignal) => Promise<SidebarResult<ExplorerListResult>>;
/** Injected change-stamp transport used by the auto-refresh poll (ADR-004 §3 amendment). */
export type StampLoader = (request: ExplorerStampRequest, signal: AbortSignal) => Promise<SidebarResult<ExplorerStampResult>>;
export type LoadState = 'idle' | 'loading' | 'error' | 'loaded';
/** One directory node (dirs only; files never get nodes). */
export interface NodeState {
    /** The node's own entry descriptor. */
    readonly entry: ExplorerEntry;
    /** Whether children are currently rendered. */
    expanded: boolean;
    /** Children once loaded; collapse does NOT unload them. */
    children?: ExplorerEntry[];
    loadState: LoadState;
    /** Present when the last list of this directory failed. */
    loadError?: SidebarError;
}
/** Top-level tree surface state (root-level failures collapse here). */
export type ExplorerSurface = {
    readonly phase: 'no-workspace';
} | {
    readonly phase: 'loading';
} | {
    readonly phase: 'loaded';
} | {
    readonly phase: 'root-error';
    readonly error: SidebarError;
};
export interface ExplorerState {
    /** Absolute root path, undefined when no workspace exists (no-workspace). */
    readonly root: string | undefined;
    readonly surface: ExplorerSurface;
    /** Node map keyed by absolute path; the synthetic root (dot) node lives here. */
    readonly nodes: Readonly<Record<string, NodeState>>;
    /** Single selected path. */
    readonly selectedPath: string | undefined;
    /** Keyboard-focused path (kept separate so refresh can restore focus). */
    readonly focusedPath: string | undefined;
    /** Root generation; bumped on every root reset to invalidate stale in-flight results. */
    readonly rootGen: number;
}
/** Last path segment of an absolute path (shared with the panel). */
export declare function basename(p: string): string;
export declare class ExplorerStore {
    private readonly loader;
    private state;
    /** Monotonic request seq per path; a response applies only to its latest seq. */
    private readonly seqs;
    /** Per-path AbortController to cancel superseded listings at the transport. */
    private readonly controllers;
    /** Last per-dir change stamp (undefined = the dir vanished); seeded per root. */
    private readonly seenStamps;
    /** True once the first stamp sweep of the current root recorded a baseline. */
    private stampsSeeded;
    /** One stamp poll at a time; overlapping interval ticks collapse. */
    private stampPolling;
    private readonly listeners;
    constructor(loader: DirectoryLoader);
    snapshot(): ExplorerState;
    subscribe(fn: () => void): () => void;
    /**
     * Replace the tree root and reset all tree state. Undefined means "no
     * workspace" (empty state). Bumps rootGen so any in-flight results from the
     * previous tree are discarded. Does not list — call loadRoot().
     */
    setRoot(path: string | undefined): void;
    /** List the root directory, driving the surface through loading/loaded/root-error. */
    loadRoot(): Promise<void>;
    /** Expand a directory, lazily listing it once if its children are not yet loaded. */
    expand(path: string): Promise<void>;
    /** Collapse a directory; children remain loaded for synchronous re-open. */
    collapse(path: string): void;
    /** Toggle expansion of a directory row (works for not-yet-loaded children). */
    toggle(path: string): void;
    /**
     * Manual refresh: re-list the root and every currently-loaded directory in
     * place (diff-in-place per D2 §5.2). Keeps expansion/selection.
     */
    refresh(): Promise<void>;
    /**
     * Silent in-place refresh of the given loaded directories (ADR-004 §3
     * amendment, explorer): re-lists them without flipping the surface back to
     * 'loading', so an auto-refresh never blanks the tree. Expansion, selection,
     * and focus are preserved by the same diff-in-place mechanics as refresh().
     * Paths without a node are skipped.
     */
    refreshDirs(paths: readonly string[]): Promise<void>;
    /**
     * Stamp sweep (ADR-004 §3 amendment, explorer): ask the host for each loaded
     * directory's change stamp and re-list ONLY the directories whose stamp moved
     * since the last sweep. The first sweep of a root refreshes every loaded
     * directory once (it also closes the window of changes made between the
     * initial load and the first sweep); later sweeps are pure diffs. A vanished
     * directory stamps undefined and drives the existing not-found prune; a
     * vanished root makes the whole request fail with not-found, which routes
     * through loadRoot so the root-error surface appears.
     */
    pollStamps(stampLoader: StampLoader): Promise<void>;
    /** Select a path (single-select); passes through undefined to clear. */
    select(path: string | undefined): void;
    /** Move keyboard focus to a path (kept separate from selection). */
    focus(path: string | undefined): void;
    /**
     * Prune a node and its whole subtree (D2 §8 non-root path-deleted). Removes
     * it from the parent's children and from the node map; a pruned selection
     * clears, and focus moves to the pruned node's parent.
     */
    prunePath(path: string): void;
    private loadList;
    private seqFor;
    private applyNode;
    private ensureNode;
    private findChildEntry;
    private parentOf;
    private abortAll;
    private emit;
}
//# sourceMappingURL=state.d.ts.map