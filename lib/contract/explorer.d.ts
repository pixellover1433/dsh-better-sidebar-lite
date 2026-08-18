/**
 * Explorer models shared by host (producer) and client (consumer).
 * Pure types + one pure sort function; no Node/DOM/React imports.
 */
export type ExplorerEntryKind = 'file' | 'directory' | 'symlink';
/** One row of a directory listing. */
export interface ExplorerEntry {
    /** Base name shown in the tree row. */
    name: string;
    /** Absolute host path; the client never joins paths itself. */
    path: string;
    /** Derived kind for rendering + lazy-load. Symlinks are never followed. */
    kind: ExplorerEntryKind;
    /** True when the basename matches a hide pattern; the client still decides visibility. */
    hidden: boolean;
    /** Present when kind === 'symlink'; the link target verbatim (never resolved). */
    linkTarget?: string;
}
export interface ExplorerListRequest {
    /** Absolute directory path to list (one level, lazy). */
    path: string;
}
/** Request to read a single file's text content (the open-file editor). */
export interface ExplorerReadRequest {
    /** Absolute path of the file to read. */
    path: string;
}
export interface ExplorerReadResult {
    /** Echo of the requested path (identity anchor for stale-response guards). */
    path: string;
    /** The file's text content (UTF-8), truncated at the host's read cap when too large. */
    content: string;
    /** True when the file exceeded the read cap and `content` was cut short. */
    truncated: boolean;
}
export interface ExplorerListResult {
    /** Echo of the requested path (identity anchor for stale-response guards). */
    path: string;
    entries: ExplorerEntry[];
    /** True when the listing was cut at the host's entry cap. */
    truncated: boolean;
}
/**
 * Auto-refresh stamp models (ADR-004 §3 amendment, explorer). The client polls
 * change stamps for its currently loaded directories instead of re-listing them
 * blindly: a poll is a handful of stat calls, and a full listing is issued only
 * for a directory whose stamp actually moved.
 */
export interface ExplorerStampRequest {
    /** Absolute root path; validated exactly like explorer/list (identity anchor + trust fence). */
    path: string;
    /** Absolute directories whose change stamps are needed. The root is conventional first. */
    dirs: readonly string[];
}
export interface ExplorerStampResult {
    /** Echo of the requested root. */
    path: string;
    /**
     * Per-directory change stamp = the directory's mtimeMs. A directory's mtime
     * moves exactly when a direct child is added/removed/renamed — the only
     * changes a tree can show (content edits move no name). `undefined` marks a
     * directory that no longer exists (or sits outside the root): the client
     * refreshes it and the existing not-found/prune path takes over.
     */
    stamps: Readonly<Record<string, number | undefined>>;
}
/**
 * Deterministic listing order: directories first, then locale-aware name
 * comparison, then full path as a stable tie-break. Pure and shared so host
 * and client tests pin the same order.
 */
export declare function compareEntries(a: ExplorerEntry, b: ExplorerEntry): number;
//# sourceMappingURL=explorer.d.ts.map