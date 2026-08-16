/** Drop loadError (e.g. when retrying); avoids writing `loadError: undefined`. */
function clearError(n) {
    const { loadError: _drop, ...rest } = n;
    void _drop;
    return rest;
}
/** Last path segment of an absolute path (shared with the panel). */
export function basename(p) {
    const parts = p.replace(/[/\\]+$/, '').split(/[/\\]/);
    return parts[parts.length - 1] ?? p;
}
/** Synthetic entry for the root (dot) node; root is always a directory. */
function rootEntry(path) {
    return { name: basename(path), path, kind: 'directory', hidden: false };
}
export class ExplorerStore {
    loader;
    state;
    /** Monotonic request seq per path; a response applies only to its latest seq. */
    seqs = new Map();
    /** Per-path AbortController to cancel superseded listings at the transport. */
    controllers = new Map();
    listeners = new Set();
    constructor(loader) {
        this.loader = loader;
        this.state = {
            root: undefined,
            surface: { phase: 'no-workspace' },
            nodes: {},
            selectedPath: undefined,
            focusedPath: undefined,
            rootGen: 0,
        };
    }
    snapshot() {
        return this.state;
    }
    subscribe(fn) {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    }
    // ---- actions ----
    /**
     * Replace the tree root and reset all tree state. Undefined means "no
     * workspace" (empty state). Bumps rootGen so any in-flight results from the
     * previous tree are discarded. Does not list — call loadRoot().
     */
    setRoot(path) {
        this.abortAll();
        const rootGen = this.state.rootGen + 1;
        if (path === undefined) {
            this.state = {
                root: undefined, surface: { phase: 'no-workspace' }, nodes: {},
                selectedPath: undefined, focusedPath: undefined, rootGen,
            };
            this.emit();
            return;
        }
        const node = { entry: rootEntry(path), expanded: false, loadState: 'idle' };
        this.state = {
            root: path, surface: { phase: 'loading' }, nodes: { [path]: node },
            selectedPath: undefined, focusedPath: undefined, rootGen,
        };
        this.emit();
    }
    /** List the root directory, driving the surface through loading/loaded/root-error. */
    async loadRoot() {
        const root = this.state.root;
        if (root === undefined)
            return;
        if (this.state.nodes[root] === undefined)
            this.ensureNode(rootEntry(root));
        this.applyNode(root, n => ({ ...clearError(n), loadState: 'loading' }));
        this.state = { ...this.state, surface: { phase: 'loading' } };
        this.emit();
        await this.loadList(root, true);
    }
    /** Expand a directory, lazily listing it once if its children are not yet loaded. */
    async expand(path) {
        const existing = this.state.nodes[path];
        const entry = existing?.entry ?? this.findChildEntry(path);
        if (entry === undefined || entry.kind !== 'directory')
            return;
        if (existing?.children !== undefined) {
            // Already loaded: render synchronously, no RPC.
            if (existing.expanded !== true)
                this.applyNode(path, n => ({ ...n, expanded: true }));
            return;
        }
        // A failed or not-yet-attempted directory retries the list; a directory
        // currently mid-load folds into the in-flight request (no duplicate).
        if (existing?.expanded === true && existing.loadState === 'loading')
            return;
        if (existing === undefined)
            this.ensureNode(entry);
        this.applyNode(path, n => ({ ...clearError(n), loadState: 'loading', expanded: true }));
        await this.loadList(path, false);
    }
    /** Collapse a directory; children remain loaded for synchronous re-open. */
    collapse(path) {
        const node = this.state.nodes[path];
        if (node === undefined || !node.expanded)
            return;
        this.applyNode(path, n => ({ ...n, expanded: false }));
    }
    /** Toggle expansion of a directory row (works for not-yet-loaded children). */
    toggle(path) {
        const existing = this.state.nodes[path];
        const entry = existing?.entry ?? this.findChildEntry(path);
        if (entry === undefined || entry.kind !== 'directory')
            return;
        if (existing?.expanded === true)
            this.collapse(path);
        else
            void this.expand(path);
    }
    /**
     * Manual refresh: re-list the root and every currently-loaded directory in
     * place (diff-in-place per D2 §5.2). Keeps expansion/selection.
     */
    async refresh() {
        const root = this.state.root;
        const loadedDirs = Object.values(this.state.nodes)
            .filter(n => n.children !== undefined && n.entry.kind === 'directory')
            .map(n => n.entry.path);
        const jobs = [];
        if (root !== undefined && loadedDirs.includes(root))
            jobs.push(this.loadList(root, true));
        for (const p of loadedDirs) {
            if (p !== root)
                jobs.push(this.loadList(p, false));
        }
        await Promise.all(jobs);
    }
    /** Select a path (single-select); passes through undefined to clear. */
    select(path) {
        if (path === this.state.selectedPath)
            return;
        this.state = { ...this.state, selectedPath: path };
        this.emit();
    }
    /** Move keyboard focus to a path (kept separate from selection). */
    focus(path) {
        if (path === this.state.focusedPath)
            return;
        this.state = { ...this.state, focusedPath: path };
        this.emit();
    }
    /**
     * Prune a node and its whole subtree (D2 §8 non-root path-deleted). Removes
     * it from the parent's children and from the node map; a pruned selection
     * clears, and focus moves to the pruned node's parent.
     */
    prunePath(path) {
        const state = this.state;
        if (state.nodes[path] === undefined || path === state.root)
            return;
        const toRemove = new Set();
        const collect = (p) => {
            if (toRemove.has(p))
                return;
            toRemove.add(p);
            const n = state.nodes[p];
            if (n?.children !== undefined)
                for (const c of n.children)
                    collect(c.path);
        };
        collect(path);
        const nodes = {};
        for (const [p, n] of Object.entries(state.nodes)) {
            if (toRemove.has(p))
                continue;
            if (n.children !== undefined) {
                const kept = n.children.filter(c => !toRemove.has(c.path));
                if (kept.length !== n.children.length) {
                    nodes[p] = { ...n, children: kept };
                    continue;
                }
            }
            nodes[p] = n;
        }
        const selectedPath = state.selectedPath !== undefined && toRemove.has(state.selectedPath)
            ? undefined
            : state.selectedPath;
        // Focus moves to the focused node's nearest surviving ancestor when the
        // focused node (or its subtree) is pruned.
        let focusedPath = state.focusedPath;
        if (focusedPath !== undefined && toRemove.has(focusedPath)) {
            let ancestor = this.parentOf(state.nodes, focusedPath);
            while (ancestor !== undefined && toRemove.has(ancestor)) {
                ancestor = this.parentOf(state.nodes, ancestor);
            }
            focusedPath = ancestor;
        }
        this.state = { ...state, nodes, selectedPath, focusedPath };
        this.emit();
    }
    // ---- internals ----
    async loadList(path, isRoot) {
        const gen = this.state.rootGen;
        const seq = this.seqFor(path);
        this.controllers.get(path)?.abort();
        const controller = new AbortController();
        this.controllers.set(path, controller);
        this.applyNode(path, n => ({ ...clearError(n), loadState: 'loading' }));
        if (isRoot) {
            this.state = { ...this.state, surface: { phase: 'loading' } };
            this.emit();
        }
        const result = await this.loader(path, controller.signal);
        // Stale-response guards: superseded by a newer request for the same path,
        // or by a root reset (rootGen changed), are dropped.
        if (controller.signal.aborted)
            return;
        if (gen !== this.state.rootGen)
            return;
        if (seq !== this.seqs.get(path))
            return;
        const node = this.state.nodes[path];
        if (node === undefined)
            return;
        this.controllers.delete(path);
        // ADR-004 non-root path-deleted: a vanished directory prunes itself and
        // its subtree; the parent stays expanded (an ephemeral toast is deferred).
        if (!isRoot && !result.ok && result.error.code === 'not-found') {
            this.prunePath(path);
            return;
        }
        const next = result.ok
            ? { ...clearError(node), loadState: 'loaded', children: result.value.entries }
            : { ...node, loadState: 'error', loadError: result.error };
        const surface = isRoot
            ? (result.ok ? { phase: 'loaded' } : { phase: 'root-error', error: result.error })
            : this.state.surface;
        this.state = {
            ...this.state,
            nodes: { ...this.state.nodes, [path]: next },
            ...(isRoot ? { surface } : {}),
        };
        this.emit();
    }
    seqFor(path) {
        const next = (this.seqs.get(path) ?? 0) + 1;
        this.seqs.set(path, next);
        return next;
    }
    applyNode(path, update) {
        const node = this.state.nodes[path];
        if (node === undefined)
            return;
        const updated = update(node);
        this.state = { ...this.state, nodes: { ...this.state.nodes, [path]: updated } };
        this.emit();
    }
    ensureNode(entry) {
        if (this.state.nodes[entry.path] !== undefined)
            return;
        const node = { entry, expanded: false, loadState: 'idle' };
        this.state = { ...this.state, nodes: { ...this.state.nodes, [entry.path]: node } };
        this.emit();
    }
    findChildEntry(path) {
        for (const n of Object.values(this.state.nodes)) {
            const found = n.children?.find(c => c.path === path);
            if (found !== undefined)
                return found;
        }
        return undefined;
    }
    parentOf(nodes, path) {
        for (const [p, n] of Object.entries(nodes)) {
            if (n.children?.some(c => c.path === path))
                return p;
        }
        return undefined;
    }
    abortAll() {
        for (const controller of this.controllers.values())
            controller.abort();
        this.controllers.clear();
    }
    emit() {
        for (const fn of Array.from(this.listeners))
            fn();
    }
}
//# sourceMappingURL=state.js.map