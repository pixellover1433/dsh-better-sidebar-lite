/**
 * Filesystem abstraction used by the host services (D6 §4.1).
 *
 * Explaining one narrow interface on purpose: the ExplorerService and its
 * root-validation logic depend only on these operations, so tests can inject an
 * in-memory fake or the real node:fs adapter without pulling in a directory
 * tree mock of the whole filesystem.
 */
import type { Dirent, Stats } from 'node:fs';
export interface FsPort {
    /** List a directory's entries without following symlinks (dirent types). */
    readdir(path: string, opts: {
        withFileTypes: true;
    }): Promise<Dirent[]>;
    /**
     * Stat a path. With `throwIfNoEntry === false` a missing path resolves to
     * undefined instead of rejecting, which is how roots are probed.
     */
    stat(path: string, opts?: {
        throwIfNoEntry?: false;
    }): Promise<Stats | undefined>;
    /** Read a file's full text content as UTF-8 (rejects on directories). */
    readFile(path: string): Promise<string>;
    /** Read a symlink target verbatim; never resolves through further links. */
    readlink(path: string): Promise<string>;
    /** Canonicalize a path, resolving symlinks and `./` `../` segments. */
    realpath(path: string): Promise<string>;
    /** True when the path is absolute for the current platform. */
    isAbsolute(path: string): boolean;
    /** Join path segments and normalize separators/segments. */
    resolve(...parts: string[]): string;
    /** Platform path separator ('\\' on Windows, '/' on POSIX). */
    sep: string;
    /** OS-aware containment test: is `child` inside `base` (case-insensitive on Windows). */
    isInside(child: string, base: string): boolean;
}
//# sourceMappingURL=port-fs.d.ts.map