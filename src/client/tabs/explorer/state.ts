/**
 * ExplorerStore — the explorer tab's single source of tree truth (ADR-004, D2 §6).
 * A plain observable store (listener set + snapshot), deliberately framework-free:
 * the panel binds it via useSyncExternalStore. All transitions are pure and
 * unit-testable without a DOM. Collapse keeps children loaded so re-opening is
 * synchronous; the stale-response guards (per-path request seq + per-tab root
 * generation) discard superseded async results.
 */
import type { ExplorerEntry, ExplorerListResult } from '../../../contract/explorer.ts'
import type { SidebarError, SidebarResult } from '../../../contract/errors.ts'

/** Injected directory listing transport (the panel wires it to the RPC facade). */
export type DirectoryLoader = (
  path: string,
  signal: AbortSignal,
) => Promise<SidebarResult<ExplorerListResult>>

export type LoadState = 'idle' | 'loading' | 'error' | 'loaded'

/** One directory node (dirs only; files never get nodes). */
export interface NodeState {
  /** The node's own entry descriptor. */
  readonly entry: ExplorerEntry
  /** Whether children are currently rendered. */
  expanded: boolean
  /** Children once loaded; collapse does NOT unload them. */
  children?: ExplorerEntry[]
  loadState: LoadState
  /** Present when the last list of this directory failed. */
  loadError?: SidebarError
}

/** Top-level tree surface state (root-level failures collapse here). */
export type ExplorerSurface =
  | { readonly phase: 'no-workspace' }
  | { readonly phase: 'loading' }
  | { readonly phase: 'loaded' }
  | { readonly phase: 'root-error'; readonly error: SidebarError }

export interface ExplorerState {
  /** Absolute root path, undefined when no workspace exists (no-workspace). */
  readonly root: string | undefined
  readonly surface: ExplorerSurface
  /** Node map keyed by absolute path; the synthetic root (dot) node lives here. */
  readonly nodes: Readonly<Record<string, NodeState>>
  /** Single selected path. */
  readonly selectedPath: string | undefined
  /** Keyboard-focused path (kept separate so refresh can restore focus). */
  readonly focusedPath: string | undefined
  /** Root generation; bumped on every root reset to invalidate stale in-flight results. */
  readonly rootGen: number
}

/** Helper type: a node without the optional loadError field (used to clear it). */
type ErrorlessNode = Omit<NodeState, 'loadError'>

/** Drop loadError (e.g. when retrying); avoids writing `loadError: undefined`. */
function clearError(n: NodeState): ErrorlessNode {
  const { loadError: _drop, ...rest } = n
  void _drop
  return rest
}

/** Last path segment of an absolute path (shared with the panel). */
export function basename(p: string): string {
  const parts = p.replace(/[/\\]+$/, '').split(/[/\\]/)
  return parts[parts.length - 1] ?? p
}

/** Synthetic entry for the root (dot) node; root is always a directory. */
function rootEntry(path: string): ExplorerEntry {
  return { name: basename(path), path, kind: 'directory', hidden: false }
}

export class ExplorerStore {
  private state: ExplorerState
  /** Monotonic request seq per path; a response applies only to its latest seq. */
  private readonly seqs = new Map<string, number>()
  /** Per-path AbortController to cancel superseded listings at the transport. */
  private readonly controllers = new Map<string, AbortController>()
  private readonly listeners = new Set<() => void>()

  constructor(private readonly loader: DirectoryLoader) {
    this.state = {
      root: undefined,
      surface: { phase: 'no-workspace' },
      nodes: {},
      selectedPath: undefined,
      focusedPath: undefined,
      rootGen: 0,
    }
  }

  snapshot(): ExplorerState {
    return this.state
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  // ---- actions ----

  /**
   * Replace the tree root and reset all tree state. Undefined means "no
   * workspace" (empty state). Bumps rootGen so any in-flight results from the
   * previous tree are discarded. Does not list — call loadRoot().
   */
  setRoot(path: string | undefined): void {
    this.abortAll()
    const rootGen = this.state.rootGen + 1
    if (path === undefined) {
      this.state = {
        root: undefined, surface: { phase: 'no-workspace' }, nodes: {},
        selectedPath: undefined, focusedPath: undefined, rootGen,
      }
      this.emit()
      return
    }
    const node: NodeState = { entry: rootEntry(path), expanded: false, loadState: 'idle' }
    this.state = {
      root: path, surface: { phase: 'loading' }, nodes: { [path]: node },
      selectedPath: undefined, focusedPath: undefined, rootGen,
    }
    this.emit()
  }

  /** List the root directory, driving the surface through loading/loaded/root-error. */
  async loadRoot(): Promise<void> {
    const root = this.state.root
    if (root === undefined) return
    if (this.state.nodes[root] === undefined) this.ensureNode(rootEntry(root))
    this.applyNode(root, n => ({ ...clearError(n), loadState: 'loading' }))
    this.state = { ...this.state, surface: { phase: 'loading' } }
    this.emit()
    await this.loadList(root, true)
  }

  /** Expand a directory, lazily listing it once if its children are not yet loaded. */
  async expand(path: string): Promise<void> {
    const existing = this.state.nodes[path]
    const entry = existing?.entry ?? this.findChildEntry(path)
    if (entry === undefined || entry.kind !== 'directory') return
    if (existing?.children !== undefined) {
      // Already loaded: render synchronously, no RPC.
      if (existing.expanded !== true) this.applyNode(path, n => ({ ...n, expanded: true }))
      return
    }
    // A failed or not-yet-attempted directory retries the list; a directory
    // currently mid-load folds into the in-flight request (no duplicate).
    if (existing?.expanded === true && existing.loadState === 'loading') return
    if (existing === undefined) this.ensureNode(entry)
    this.applyNode(path, n => ({ ...clearError(n), loadState: 'loading', expanded: true }))
    await this.loadList(path, false)
  }

  /** Collapse a directory; children remain loaded for synchronous re-open. */
  collapse(path: string): void {
    const node = this.state.nodes[path]
    if (node === undefined || !node.expanded) return
    this.applyNode(path, n => ({ ...n, expanded: false }))
  }

  /** Toggle expansion of a directory row (works for not-yet-loaded children). */
  toggle(path: string): void {
    const existing = this.state.nodes[path]
    const entry = existing?.entry ?? this.findChildEntry(path)
    if (entry === undefined || entry.kind !== 'directory') return
    if (existing?.expanded === true) this.collapse(path)
    else void this.expand(path)
  }

  /**
   * Manual refresh: re-list the root and every currently-loaded directory in
   * place (diff-in-place per D2 §5.2). Keeps expansion/selection.
   */
  async refresh(): Promise<void> {
    const root = this.state.root
    const loadedDirs = Object.values(this.state.nodes)
      .filter(n => n.children !== undefined && n.entry.kind === 'directory')
      .map(n => n.entry.path)
    const jobs: Promise<void>[] = []
    if (root !== undefined && loadedDirs.includes(root)) jobs.push(this.loadList(root, true))
    for (const p of loadedDirs) {
      if (p !== root) jobs.push(this.loadList(p, false))
    }
    await Promise.all(jobs)
  }

  /** Select a path (single-select); passes through undefined to clear. */
  select(path: string | undefined): void {
    if (path === this.state.selectedPath) return
    this.state = { ...this.state, selectedPath: path }
    this.emit()
  }

  /** Move keyboard focus to a path (kept separate from selection). */
  focus(path: string | undefined): void {
    if (path === this.state.focusedPath) return
    this.state = { ...this.state, focusedPath: path }
    this.emit()
  }

  /**
   * Prune a node and its whole subtree (D2 §8 non-root path-deleted). Removes
   * it from the parent's children and from the node map; a pruned selection
   * clears, and focus moves to the pruned node's parent.
   */
  prunePath(path: string): void {
    const state = this.state
    if (state.nodes[path] === undefined || path === state.root) return
    const toRemove = new Set<string>()
    const collect = (p: string): void => {
      if (toRemove.has(p)) return
      toRemove.add(p)
      const n = state.nodes[p]
      if (n?.children !== undefined) for (const c of n.children) collect(c.path)
    }
    collect(path)
    const nodes: Record<string, NodeState> = {}
    for (const [p, n] of Object.entries(state.nodes)) {
      if (toRemove.has(p)) continue
      if (n.children !== undefined) {
        const kept = n.children.filter(c => !toRemove.has(c.path))
        if (kept.length !== n.children.length) {
          nodes[p] = { ...n, children: kept }
          continue
        }
      }
      nodes[p] = n
    }
    const selectedPath = state.selectedPath !== undefined && toRemove.has(state.selectedPath)
      ? undefined
      : state.selectedPath
    // Focus moves to the focused node's nearest surviving ancestor when the
    // focused node (or its subtree) is pruned.
    let focusedPath = state.focusedPath
    if (focusedPath !== undefined && toRemove.has(focusedPath)) {
      let ancestor = this.parentOf(state.nodes, focusedPath)
      while (ancestor !== undefined && toRemove.has(ancestor)) {
        ancestor = this.parentOf(state.nodes, ancestor)
      }
      focusedPath = ancestor
    }
    this.state = { ...state, nodes, selectedPath, focusedPath }
    this.emit()
  }

  // ---- internals ----

  private async loadList(path: string, isRoot: boolean): Promise<void> {
    const gen = this.state.rootGen
    const seq = this.seqFor(path)
    this.controllers.get(path)?.abort()
    const controller = new AbortController()
    this.controllers.set(path, controller)

    this.applyNode(path, n => ({ ...clearError(n), loadState: 'loading' }))
    if (isRoot) {
      this.state = { ...this.state, surface: { phase: 'loading' } }
      this.emit()
    }

    const result = await this.loader(path, controller.signal)

    // Stale-response guards: superseded by a newer request for the same path,
    // or by a root reset (rootGen changed), are dropped.
    if (controller.signal.aborted) return
    if (gen !== this.state.rootGen) return
    if (seq !== this.seqs.get(path)) return
    const node = this.state.nodes[path]
    if (node === undefined) return
    this.controllers.delete(path)

    // ADR-004 non-root path-deleted: a vanished directory prunes itself and
    // its subtree; the parent stays expanded (an ephemeral toast is deferred).
    if (!isRoot && !result.ok && result.error.code === 'not-found') {
      this.prunePath(path)
      return
    }

    const next: NodeState = result.ok
      ? { ...clearError(node), loadState: 'loaded', children: result.value.entries }
      : { ...node, loadState: 'error', loadError: result.error }
    const surface: ExplorerSurface = isRoot
      ? (result.ok ? { phase: 'loaded' } : { phase: 'root-error', error: result.error })
      : this.state.surface
    this.state = {
      ...this.state,
      nodes: { ...this.state.nodes, [path]: next },
      ...(isRoot ? { surface } : {}),
    }
    this.emit()
  }

  private seqFor(path: string): number {
    const next = (this.seqs.get(path) ?? 0) + 1
    this.seqs.set(path, next)
    return next
  }

  private applyNode(path: string, update: (n: NodeState) => NodeState): void {
    const node = this.state.nodes[path]
    if (node === undefined) return
    const updated = update(node)
    this.state = { ...this.state, nodes: { ...this.state.nodes, [path]: updated } }
    this.emit()
  }

  private ensureNode(entry: ExplorerEntry): void {
    if (this.state.nodes[entry.path] !== undefined) return
    const node: NodeState = { entry, expanded: false, loadState: 'idle' }
    this.state = { ...this.state, nodes: { ...this.state.nodes, [entry.path]: node } }
    this.emit()
  }

  private findChildEntry(path: string): ExplorerEntry | undefined {
    for (const n of Object.values(this.state.nodes)) {
      const found = n.children?.find(c => c.path === path)
      if (found !== undefined) return found
    }
    return undefined
  }

  private parentOf(nodes: Readonly<Record<string, NodeState>>, path: string): string | undefined {
    for (const [p, n] of Object.entries(nodes)) {
      if (n.children?.some(c => c.path === path)) return p
    }
    return undefined
  }

  private abortAll(): void {
    for (const controller of this.controllers.values()) controller.abort()
    this.controllers.clear()
  }

  private emit(): void {
    for (const fn of Array.from(this.listeners)) fn()
  }
}