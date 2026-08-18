import { compareEntries, HOST_DEFAULTS, sidebarError, } from "../contract/index.js";
/** Build a SidebarError branch that carries a path. */
function errPath(code, message, path) {
    return { code, message, path };
}
/** Map a node fs error to a typed SidebarError (D6 §4.7). */
export function mapFSError(raw, path) {
    const e = raw;
    switch (e.code) {
        case 'ENOENT': return errPath('not-found', e.message ?? String(raw), path);
        case 'EACCES':
        case 'EPERM': return errPath('permission-denied', e.message ?? String(raw), path);
        case 'ENOTDIR': return errPath('not-directory', e.message ?? String(raw), path);
        case 'ELOOP': return errPath('symlink-loop', e.message ?? String(raw), path);
        default: return sidebarError('internal', e?.message ?? String(raw));
    }
}
export class ExplorerService {
    fs;
    opts;
    constructor(fs, opts) {
        this.fs = fs;
        this.opts = opts;
    }
    /**
     * List one directory level. Resolves/validates the root, reads entries,
     * sorts dirs-first, applies the entry-count and cumulative-byte caps.
     * Rejects with a typed SidebarError on invalid roots / fs errors.
     */
    async list(request) {
        const root = await this.assertListableRoot(request.path);
        const dirents = await this.readDir(root);
        const entries = [];
        for (const dirent of dirents) {
            entries.push(await this.toEntry(root, dirent));
        }
        entries.sort(compareEntries);
        return this.applyCaps(root, entries);
    }
    /**
     * Auto-refresh stamp sweep (ADR-004 §3 amendment): validate the root like a
     * list, then return each requested directory's mtimeMs stamp. A directory's
     * mtime moves exactly when a direct child is added/removed/renamed, so the
     * client can diff stamps instead of re-listing idle directories. A vanished
     * (or out-of-root) directory stamps `undefined`; a vanished root fails the
     * whole request like a list would.
     */
    async stamp(request) {
        const root = await this.assertListableRoot(request.path);
        const stamps = {};
        const seen = new Set();
        for (const dir of request.dirs) {
            if (seen.has(dir))
                continue;
            seen.add(dir);
            // A loaded dir always sits under the root (the client only polls its own
            // tree); out-of-root or relative dirs stamp undefined rather than leak
            // stat reach outside the trust fence.
            if (!this.fs.isAbsolute(dir) || !this.fs.isInside(dir, root)) {
                stamps[dir] = undefined;
                continue;
            }
            let st;
            try {
                st = await this.fs.stat(dir, { throwIfNoEntry: false });
            }
            catch (raw) {
                throw mapFSError(raw, dir);
            }
            stamps[dir] = st?.mtimeMs;
        }
        return { path: root, stamps };
    }
    /** Validate the path is absolute, within length, and inside the trust fence. */
    assertWithinRoots(candidate) {
        if (!this.fs.isAbsolute(candidate)) {
            throw errPath('param-invalid', 'path must be absolute', candidate);
        }
        if (candidate.length > HOST_DEFAULTS.maxRequestPathLength) {
            throw errPath('param-invalid', 'path too long', candidate);
        }
        const root = this.fs.resolve(candidate);
        const roots = this.opts.allowedRoots;
        if (roots !== undefined && roots.length > 0) {
            const inside = roots.some(base => this.fs.isInside(root, base));
            if (!inside) {
                throw errPath('outside-allowed-root', root + ' is outside configured allowed roots', root);
            }
        }
        return root;
    }
    /** Validate the root before any listing (D6 §4.6); must be a directory. */
    async assertListableRoot(candidate) {
        const root = this.assertWithinRoots(candidate);
        let st;
        try {
            st = await this.fs.stat(root, { throwIfNoEntry: false });
        }
        catch (raw) {
            throw mapFSError(raw, root);
        }
        if (st === undefined) {
            throw errPath('not-found', 'path does not exist', root);
        }
        if (!st.isDirectory()) {
            throw errPath('not-directory', 'expected a directory', root);
        }
        return root;
    }
    /** Validate a path before reading it; must be a file (directories are rejected). */
    async assertReadableFile(candidate) {
        const root = this.assertWithinRoots(candidate);
        let st;
        try {
            st = await this.fs.stat(root, { throwIfNoEntry: false });
        }
        catch (raw) {
            throw mapFSError(raw, root);
        }
        if (st === undefined) {
            throw errPath('not-found', 'path does not exist', root);
        }
        if (!st.isFile()) {
            throw errPath('not-directory', 'expected a file', root);
        }
        return root;
    }
    /**
     * Read a single file's text content (open-file editor). Validates the path
     * exactly like list (absolute, within allowedRoots) but requires a file and
     * rejects directories. Content larger than the read cap is cut at the cap
     * and marked truncated to bound memory/bandwidth.
     */
    async read(request) {
        const file = await this.assertReadableFile(request.path);
        const cap = this.opts.maxReadBytes ?? HOST_DEFAULTS.maxReadBytes;
        let content;
        try {
            content = await this.fs.readFile(file);
        }
        catch (raw) {
            throw mapFSError(raw, file);
        }
        if (content.length <= cap) {
            return { path: file, content, truncated: false };
        }
        return { path: file, content: content.slice(0, cap), truncated: true };
    }
    async readDir(root) {
        try {
            return await this.fs.readdir(root, { withFileTypes: true });
        }
        catch (raw) {
            throw mapFSError(raw, root);
        }
    }
    /** Map one Dirent to an ExplorerEntry (symlinks reported, never followed). */
    async toEntry(root, dirent) {
        const name = dirent.name;
        const p = this.fs.resolve(root, name);
        if (dirent.isSymbolicLink()) {
            const linkTarget = await this.readlinkBestEffort(p);
            return {
                name,
                path: p,
                kind: 'symlink',
                hidden: this.isHidden(name),
                ...(linkTarget === undefined ? {} : { linkTarget }),
            };
        }
        return {
            name,
            path: p,
            kind: dirent.isDirectory() ? 'directory' : 'file',
            hidden: this.isHidden(name),
        };
    }
    isHidden(name) {
        return this.opts.hidePatterns.includes(name);
    }
    /** Readlink verbatim; only a vanished symlink yields no target (the entry
     * still renders as a symlink row). Any other readlink failure is a real
     * error and fails the listing like every other fs error. */
    async readlinkBestEffort(p) {
        try {
            return await this.fs.readlink(p);
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return undefined;
            throw error;
        }
    }
    /** Apply the entry-count and cumulative-path-byte caps (D6 §4.5). */
    applyCaps(root, sorted) {
        const out = [];
        let truncated = false;
        let bytes = 0;
        for (const entry of sorted) {
            if (out.length >= this.opts.maxEntries) {
                truncated = true;
                break;
            }
            const add = entry.name.length + entry.path.length;
            if (bytes + add > HOST_DEFAULTS.totalListingPathBytes) {
                truncated = true;
                break;
            }
            out.push(entry);
            bytes += add;
        }
        return { path: root, entries: out, truncated };
    }
}
//# sourceMappingURL=explorer.js.map