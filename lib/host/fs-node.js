/**
 * Real FsPort adapter over node:fs/promises + node:path (D6 §4.1).
 * The single production FsPort; tests may inject their own.
 */
import { promises as fsPromises } from 'node:fs';
import * as path from 'node:path';
/** Normalize mixed separators to '/' for case-insensitive containment checks. */
function normalizeSeparators(p) {
    return p.replace(/[\\/]/g, '/');
}
/**
 * POSIX/Windows-aware containment. On Windows the comparison is
 * case-insensitive; everywhere it uses a boundary so `C:\foo` is inside
 * `C:\foo` but not `C:\foobar`.
 */
function isInsidePath(child, base, caseInsensitive) {
    const c = normalizeSeparators(child);
    const b = normalizeSeparators(base);
    if (c === b)
        return true;
    const prefix = b.endsWith('/') ? b : b + '/';
    return caseInsensitive
        ? c.toLowerCase().startsWith(prefix.toLowerCase())
        : c.startsWith(prefix);
}
/** Whether the process treats paths as case-insensitive (Windows). */
const caseInsensitive = process.platform === 'win32';
export const fsNode = {
    readdir: (p, opts) => fsPromises.readdir(p, opts),
    stat: (p, opts) => fsPromises.stat(p, opts),
    readFile: (p) => fsPromises.readFile(p, 'utf8'),
    readlink: (p) => fsPromises.readlink(p),
    realpath: (p) => fsPromises.realpath(p),
    isAbsolute: (p) => path.isAbsolute(p),
    resolve: (...parts) => path.resolve(...parts),
    sep: path.sep,
    isInside: (child, base) => isInsidePath(child, base, caseInsensitive),
};
//# sourceMappingURL=fs-node.js.map