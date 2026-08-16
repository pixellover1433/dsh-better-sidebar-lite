import { type ExplorerListRequest, type ExplorerListResult, type SidebarError } from '../contract/index.ts';
import type { FsPort } from './port-fs.ts';
/** ExplorerService construction options. */
export interface ExplorerOptions {
    /** Per-level listing cap (default 2000); exceeding sets truncated. */
    maxEntries: number;
    /** Basenames hidden by default (.git, node_modules). */
    hidePatterns: readonly string[];
    /** Absolute roots allowed to be listed. Empty/undefined = any absolute readable dir. */
    allowedRoots?: readonly string[];
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
    /** Validate the root before any listing (D6 §4.6). */
    private assertListableRoot;
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