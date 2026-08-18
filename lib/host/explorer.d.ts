import { type ExplorerListRequest, type ExplorerListResult, type ExplorerReadRequest, type ExplorerReadResult, type ExplorerStampRequest, type ExplorerStampResult, type SidebarError } from '../contract/index.ts';
import type { FsPort } from './port-fs.ts';
/** ExplorerService construction options. */
export interface ExplorerOptions {
    /** Per-level listing cap (default 2000); exceeding sets truncated. */
    maxEntries: number;
    /** Basenames hidden by default (.git, node_modules). */
    hidePatterns: readonly string[];
    /** Absolute roots allowed to be listed. Empty/undefined = any absolute readable dir. */
    allowedRoots?: readonly string[];
    /**
     * Read-cap on a single file's text content (open-file editor). Files larger
     * than this resolve with truncated=true; defaults to the contract default.
     */
    maxReadBytes?: number;
}
/** Map a node fs error to a typed SidebarError (D6 §4.7). */
export declare function mapFSError(raw: unknown, path: string): SidebarError;
export declare class ExplorerService {
    private readonly fs;
    private readonly opts;
    constructor(fs: FsPort, opts: ExplorerOptions);
    /**
     * List one directory level. Resolves/validates the root, reads entries,
     * sorts dirs-first, applies the entry-count and cumulative-byte caps.
     * Rejects with a typed SidebarError on invalid roots / fs errors.
     */
    list(request: ExplorerListRequest): Promise<ExplorerListResult>;
    /**
     * Auto-refresh stamp sweep (ADR-004 §3 amendment): validate the root like a
     * list, then return each requested directory's mtimeMs stamp. A directory's
     * mtime moves exactly when a direct child is added/removed/renamed, so the
     * client can diff stamps instead of re-listing idle directories. A vanished
     * (or out-of-root) directory stamps `undefined`; a vanished root fails the
     * whole request like a list would.
     */
    stamp(request: ExplorerStampRequest): Promise<ExplorerStampResult>;
    /** Validate the path is absolute, within length, and inside the trust fence. */
    private assertWithinRoots;
    /** Validate the root before any listing (D6 §4.6); must be a directory. */
    private assertListableRoot;
    /** Validate a path before reading it; must be a file (directories are rejected). */
    private assertReadableFile;
    /**
     * Read a single file's text content (open-file editor). Validates the path
     * exactly like list (absolute, within allowedRoots) but requires a file and
     * rejects directories. Content larger than the read cap is cut at the cap
     * and marked truncated to bound memory/bandwidth.
     */
    read(request: ExplorerReadRequest): Promise<ExplorerReadResult>;
    private readDir;
    /** Map one Dirent to an ExplorerEntry (symlinks reported, never followed). */
    private toEntry;
    private isHidden;
    /** Readlink verbatim; only a vanished symlink yields no target (the entry
     * still renders as a symlink row). Any other readlink failure is a real
     * error and fails the listing like every other fs error. */
    private readlinkBestEffort;
    /** Apply the entry-count and cumulative-path-byte caps (D6 §4.5). */
    private applyCaps;
}
//# sourceMappingURL=explorer.d.ts.map