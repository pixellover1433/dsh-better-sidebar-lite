# D2 — Explorer Tab: Tree Model & Interaction

> Design doc for the **explorer** tab of dsh-better-sidebar-lite (right-docked sidebar plugin for DeepSeek Harness web). This doc is the design contract for the implementer subagents that build the explorer tree. It proposes the **explorer subset of the RPC contract**; D5 owns the full transport contract and harmonizes. It feeds D6 (host explorer service), D7 (client UI), and D8 (testing).

## 0. Scope & non-goals

**In scope:**
- Tree **node model** and its load-state machine (contract + client state).
- **Root resolution** — which directory the tree shows.
- **Sorting**, **hidden-file policy**, **symlink policy**.
- **Lazy-loading protocol** (one RPC per expanded directory).
- **Expansion/selection state** ownership and persistence.
- **Refresh semantics** + stale-response guard.
- **Keyboard/a11y** contract.
- **Open-file event** (a typed, subscribe-able bus event — *no editor today*).
- Error / empty / loading surfaces (permission-denied, path-deleted, not-found).

**Out of scope (owned by other design docs):**
- Full RPC transport envelope, validation, cancellation plumbing, error-code *physical* mapping → D5.
- Host filesystem walk implementation, caps, git → D6.
- Dock shell, tab registry, themes, locales → D7 (and D4 for the tab registry).
- Unit/e2e test strategy → D8.

## 1. Verified dsh API facts this design builds on

Confirmed by reading dsh sources (paths relative to `../deepseek-harness`):

| Fact | Source |
|---|---|
| `ConnectionRpcHandler = (endpoint, payload, signal) => Promise<RpcResult<unknown>>`; host registers via `ctx.connection.rpc.handle(channel, handler, { authority })`; client calls via `ctx.connection.rpc.call(channel, endpoint, payload, signal?)`. | `packages/client/connection/src/rpc.ts` (lines 14–19, 33–37, 71–76) |
| `RpcResult<T> = { ok: true; value: T } | { ok: false; error: RpcError }`; `RpcError` is a **closed** discriminated union on `code` (`bad-request`, `cancelled`, `internal`, …). Plugins define their own codes in their own contract module and fold into this shape at the boundary. | `packages/host/apiproxy/src/api/rpc.ts` (lines 112–116) |
| `ConnectionRpcAuthority = 'trusted-host' | 'loopback'`; our channel uses `'loopback'`. | `packages/client/connection/src/rpc.ts` (line 6) |
| Host plugin config uses `Config: z<T> = z.object({ ... })` via schemastery (import `from '@deepseek-ai/schemastery'`). | `packages/client/connection/src/index.ts` (line 64); `packages/attachment/attachment-local/src/index.ts` (line 5) |
| `useWorkspaces` → `WorkspaceListState { items, state, phase, error, baselinesReady, recentWorkspaceId? }`; `useSessions` → `SessionListState { ids, byId, current, phase, … }`. Both are injected as `GlobalStandardProps` into **global-slot** components. | `packages/client/runtime/src/client/workspaces/service.ts` (line 15); `.../sessions/service.ts` (line 80); `.../client/index.ts` (lines 146–150) |
| `WorkspaceView` carries canonical `path`, `workspaceId`, `title`, `sessionIds`, and ISO timestamps. | `packages/host/apiproxy/src/api/workspace.ts` (lines 21–36) |
| `SessionSummary` carries `cwd?: string` (optional). | `packages/client/runtime/src/client/sessions/service.ts` (line 48) |
| Global slot `shell.overlay` (kind **list**, scope root) is our right-docked sidebar seat. Kind **list** registration requires options `id` and `order`. | `packages/client/ui-layout/src/client/index.ts`; `packages/client/ui-slots/src/index.ts` (lines 813–818) |
| Feature client plugin shape: `export const inject = [...]; apply(ctx) { ctx.effect(...); ctx.slots.inject(name, () => ctx.slots.register({...}, Component)) }`. | `packages/client/ui-jobs/src/client/index.ts` |

**Design note on where the tab's data flows:** the explorer tab component is registered on the global `shell.overlay` slot (scope root), so it receives the global standard props `useSessions` and `useWorkspaces` for free. It does **not** get a session-scoped `useSession`. If a future requirement needs per-session root resolution, that lives in a session-scoped slot owned by the dock shell (D7), not this tab.

---

## 2. Contract module — tree models (`src/contract/explorer.ts`)

All types are dependency-free and live in `src/contract/explorer.ts` (re-exported from `src/contract/index.ts`). Shared by host and client. No Node or DOM types; no dsh imports (keeps `./contract` importable by both halves and by tests).

### 2.1 Node identity and display model

A node is identified by its **absolute host path** (the client never joins path segments itself — same rule as dsh's `DirectoryEntry`, where the host computes `.path`).

```ts
/** One visible row in the explorer tree (client-side projection). */
export interface TreeNode {
  /** Absolute host path; the node's stable identity across refreshes. */
  readonly path: string
  /** Base name shown in the row. */
  readonly name: string
  /** Display-kind of the node; drives icon and whether it can have children. */
  readonly kind: TreeNodeKind
  /** Whether this node can have children (dir, or symlink-to-dir). */
  readonly expandable: boolean
  /** Filesystem stats the host already read; see §2.2 for optionality. */
  readonly stat?: Readonly<TreeStat>
  /** True when this node's children are currently loaded (expanded at least once). */
  readonly loaded: boolean
  /** True when this node is expanded (children visible). */
  readonly expanded: boolean
  /** Set on a directory whose last list attempt failed (retry on re-expand). */
  readonly loadFailed?: boolean
}

export type TreeNodeKind =
  | 'directory'
  | 'file'
  | 'symlink'        // symlink resolved; target kind in stat.isDirectory when known
  | 'unknown'        // stat.io error (e.g. broken symlink) — rendered file-ish, non-expandable
```

**Decision:** `loaded` (children fetched) and `expanded` (children rendered) are separate axes. A directory can be `loaded` but `expanded=false` (collapsed after expanding once); collapsing does **not** unload. This is what makes re-expansion synchronous and the tree feel fast. See §6 for the state machine.

### 2.2 The “entry descriptor” the host returns per child

The host returns **lightweight, absolute-path-safe entries** (not full tree nodes) so the client can lazy-construct nodes. This mirrors dsh's `DirectoryEntry` but adds kind + optional stat, which the explorer UI needs for icons/sorting.

```ts
/** One child of a listed directory, as returned by explorer/list (host→client). */
export interface TreeEntry {
  /** Absolute host path (host-computed canonical form). */
  readonly path: string
  /** Base name. */
  readonly name: string
  /** Directory if isDirectory(); file otherwise; symlink resolved per policy (§4.3). */
  readonly kind: 'directory' | 'file'
  /** True when the host resolved this path to a symlink (after following the link). */
  readonly isSymlink: boolean
  /**
   * Stats already read by the host. The host may elide size/mtime for
   * directories to keep readdir+lstat cheap. Absent means “not collected”.
   */
  readonly stat?: Readonly<TreeStat>
  /** True only when the parent request set includeHidden and this name is dot-prefixed. */
  readonly hidden?: boolean
}

/** Optional per-entry stats; directories may omit size. */
export interface TreeStat {
  readonly size?: number
  readonly mtimeMs?: number
  /** Resolved stat following symlinks (true kind of a symlink's target). */
  readonly isDirectory: boolean
  readonly isSymlink: boolean
  readonly isFile: boolean
}
```

**Decision:** keep `stat` minimal and **optional**. The lite tree UI does not render size/mtime columns, so collecting full stats on every entry is wasted cost on large directories. Leaf sorting and icons need only `kind`. Size/mtime are included for a future “details” affordance — not today's UI. D6 decides the exact fs calls (`readdir` with `withFileTypes`, optional per-entry `lstat`); the contract treats stats as best-effort.

### 2.3 Listing payload

The host's `explorer/list` result is purely the data payload; per-node **load state** lives on the client (§6), not in the host response.

```ts
/** Host result payload of explorer/list. */
export interface ExplorerListResult {
  /** Absolute path of the directory that was listed. */
  readonly path: string
  /** Sorted child entries (host already sorts; order guaranteed dirs-first, see §4.1). */
  readonly entries: readonly TreeEntry[]
  /** True when the host truncated at the delegated cap (D6 maxEntries). */
  readonly truncated: boolean
  /** Total children before truncation, when known. */
  readonly totalCount?: number
}
```

**Decision:** the host returns **pre-sorted** entries (§4.1). Sorting is a host responsibility so one code path (and one unit-tested function) serves every client and matches “list one directory” semantics. The client does not re-sort (a future watcher feeding unsorted deltas would change this — not today).

### 2.4 Error codes (explorer subset — D5 harmonizes into the transport)

Proposed error codes, as a typed vocabulary. They live in our contract module; D5 owns mapping them into the transport error branch (which uses the **closed** `RpcErrorCode` union — see verification above — so our codes are wrapped; see §2.5).

```ts
/** Explorer-specific error code vocabulary (dsh has no equivalent; D5 maps to transport shape). */
export type ExplorerErrorCode =
  | 'not-found'            // path does not exist on host
  | 'not-directory'        // path exists but is not a directory
  | 'permission-denied'    // EACCES/EPERM reading the directory
  | 'invalid-path'         // payload path failed host validation (§4.4)
  | 'cancelled'            // superseded by a newer request for the same path
```

**Decision:** we deliberately do **not** have a generic `io-error`. Every host fs failure maps to one of `not-found`, `not-directory`, `permission-denied`, or (unexpected) `internal` at the transport boundary. `too-many-entries` was considered but dropped: D6's cap is truncating-by-default (sets `truncated`), so exceeding the cap is a normal, non-fatal outcome. The semantic codes above are fixed here; D5 decides the transport wrapper (likely an `RpcError` with the explorer code folded into `details`).

### 2.5 Client-side unified result

For type-safety in client code, the client maps the transport result to one wrapper:

```ts
/** Client-visible result of a list request (transport-agnostic; built from RpcResult). */
export type ExplorerResult<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'error'; code: ExplorerErrorCode; message: string; details?: unknown }
```

**Decision:** the client never reaches into `RpcError` directly. A thin adapter in the explorer rpc module (§11) maps `RpcResult` → `ExplorerResult` (connection failures → `internal`/`cancelled`). This keeps the UI decoupled from the transport shape and gives one seam for D5's harmonization.

---

## 3. RPC surface (proposal — D5 harmonizes)

Proposal for the **explorer subset**, all under the channel `/better-sidebar`:

| Endpoint | Client→Host payload | Host→Client result value |
|---|---|---|
| `explorer/list` | `{ path: string; includeHidden?: boolean }` | `ExplorerListResult` or an error |

**Decision: one directory per RPC call.** No batched-depth, no recursive preload. Rationale:
- The sidebar is a small dock; users expand directories they care about. Preloading depth wastes bandwidth/RPC cost for the majority tree they never open.
- Per-directory calls give natural per-node error states (§8) and a trivial stale-guard (§5.3: key by `path` + sequence).
- It matches the ui behavior (expand → load → render), keeps host listing cheap, and lets D6 apply per-directory caps.

The client may issue **concurrent** `explorer/list` calls for different directories (parallel expansion is fine). For the **same** path, the cache + seq guard in §5.3 coalesces them.

**Root listing is the same endpoint.** The root (the `dot` node, §6) is just the first directory listed; there is no dedicated `explorer/root`.

**Deferred (not in this contract):** `explorer/resolve` (path→ancestry for deep-linking) and `explorer/meta` (root refresh stamp) are explicitly not built today.

---

## 4. Tree semantics

### 4.1 Sorting (all directories, all levels)

**Decision: directories first, then files; within each group, `localeCompare` with `{ numeric: true, sensitivity: 'base' }`.** The host applies once after reading entries.

```ts
/** Sort comparator applied by the host to a directory's child entries. */
export function compareEntries(a: TreeEntry, b: TreeEntry): number {
  if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
}
```

- `numeric: true` → `file2` before `file10`.
- `sensitivity: 'base'` → case-insensitive ordering, deterministic tie-break by engine byte order. **Decision:** do NOT use `caseFirst` (not supported in all engines). Deterministic output is testable (D8 fixture).
- **Decision:** a symlink-to-directory sorts as a directory (its `kind` resolves to `directory`), so it lands in the dirs group. Broken/unknown symlinks sort as files.
- Hidden entries are always sorted into the same groups (hidden policy is a filter, not a separate group).

### 4.2 Hidden-file policy

**Decision: the host filters `ignoreNames` unconditionally; the host filters dot-prefixed names unless the request sets `includeHidden: true` (default false); with `includeHidden`, the host marks them `hidden: true` and the client renders them in a distinct trailing “hidden” group.**

```ts
/** Explorer-relevant host config (D6 validates + applies; defaults fixed here). */
export interface ExplorerConfig {
  /** Names always hidden regardless of dot-prefix. Default: ['.git','node_modules','.DS_Store','.idea']. */
  readonly ignoreNames: readonly string[]
}
```

Rationale for the host/client split of the dot-filter:
- `ignoreNames` is always server-side: never useful to reveal, and stripping `.git`/`node_modules` keeps payloads small.
- The dot-filter is split because a “show hidden” toggle is nicer than a hard hide: the host keeps the default payload small (`includeHidden` unset → dot entries omitted) but supports revealing them as a `hidden` marker the client styles — so toggling hidden is a re-fetch with the flag (§12, and open question #1), simpler than client-side re-styling of server-hidden rows.

### 4.3 Symlink policy

**Decision: show symlinks; do NOT auto-follow for expansion.**
- The host resolves each symlink enough to classify it (`lstat` for linkness, plus a target stat when readable).
- A symlink-to-directory renders as a directory (grouped/sorted as a dir) and *looks* expandable. Expanding lists the **resolved target** path (the node’s `path` becomes the resolved canonical target so identity is stable and the guard works); the link name stays the display name.
- A symlink-to-file renders as a file.
- A **broken** symlink renders as a non-expandable `kind: 'unknown'` node with a warning icon; it never triggers a list (avoids `not-found` errors hammering its parent refresh).
- **Decision:** symlinks are not auto-hidden and not deduped. There is **no cycle risk** in the lite tree because we only ever expand one level on user action and never auto-walk; a symlink into an ancestor simply renders that subtree. A future “expand all” must add a visited-resolved-path cycle guard (noted for D7; out of today's scope).

### 4.4 Path validation (host trust boundary)

Mirrors the brief's §4.4 requirement. The explorer contract:

```ts
/** Absolute host path the client sends; the client never builds paths by joining segments. */
type ExplorerAbsolutePath = string

/** Host-side guard the explorer list handler runs before any fs access (D6 implements). */
export interface ExplorerPathGuard {
  /** true only for an absolute path (host platform semantics). */
  isAbsolute(p: string): boolean
  /** true when an allowedRoots allowlist is configured and p is at/under one root; true when the allowlist is empty (allow-any). */
  isAllowed(p: string): boolean
}
```

**Host checks, in order (D6 implements; the contract):**
1. `path` is a non-empty string → else `invalid-path`.
2. `path` is absolute → else `invalid-path`.
3. `isAllowed`: when `allowedRoots` is configured, the resolved path must sit at/under one; default (no config) allows any absolute path the host process can read — the intent is that the **loopback authority** is the trust fence, not an ACL.

**Decision:** path building/splitting stays off the client. The client sends only absolute paths obtained from workspace/session metadata or a prior listing; it never string-joins a child path. This removes an entire class of traversal/escaping bugs and matches dsh's `DirectoryEntry.path` contract.

---

## 5. Refresh semantics

### 5.1 Triggers

**Decision: three refresh sources, each with a distinct scope:**
1. **Manual refresh** (header button): re-lists the root **and every currently-expanded directory** in place (diff children; see §5.2). Collapsed dirs are not refetched (re-expanding lists fresh anyway).
2. **Auto-refresh on root change**: when the resolved root path *changes value* (§7), the tree **fully resets** (§5.2) and lists the new root.
3. **Auto-refresh on workspace/session metadata change**: when the active session `cwd` or current workspace `path` *changes value*, the tree resets to the (new) root and lists. We do **not** refetch every expanded dir here — a changed root is a different tree.

**No filesystem watcher** in today's scope (lite). External edits surface only via manual refresh; documented as a known limitation (README/D8).

### 5.2 Reset vs diff

**Decision: on root change → FULL RESET.** New root clears selected/expanded nodes, creates a fresh `dot` node, and lists the root. Same root, manual refresh → **diff-in-place** for every expanded dir (replace child arrays; keep nodes present in both by path; add new; prune gone). The node map keyed by path makes this a pure reducible diff. Reset is correct for the root case; in-place refresh preserves expansion/selection state — the whole point of lazy loading.

Manual refresh is effectively: `for each expanded path: refetch → replace children; preserve expansion/selection where paths still exist`.

### 5.3 Stale-response guard (rapid toggles)

The classic race: expand → collapse → re-expand, or rapid root switches; an earlier response can land late and overwrite newer state.

**Decision: per-node request sequence + per-tab root generation.**
- Each node (by path) keeps a monotonic `requestSeq`; on expand the client bumps a per-path seq *before* sending. A response applies only if its seq still equals the latest issued for that path.
- A per-tab `rootGen` bumps on every root reset; any in-flight response tagged with an older `rootGen` is discarded wholesale.
- The host receives an `AbortSignal` (the RPC handler signature) for cancellation of a superseded listing; D5 wires a client `AbortController` into `rpc.call`. The client ignores `cancelled` errors (expected).
- The seq guard is cheap (two integers) and lives in the client store (§6). D5 owns transport-level abort; the seq guard is the UI-level authority that still corrects an abort’s absence.

---

## 6. State ownership: expansion & selection

**Decision: a single small client-side store owned by the explorer tab, exposed via a React hook.** Cleaner than ad-hoc `useState`; makes manual-refresh diff, the stale-guard, and testability straightforward. Deliberately **not** a persisted dsh store seat (expansion/selection is throwaway local UI state). Active-tab and preference persistence belong to D4/D7.

```ts
// src/client/explorer/state.ts (internal to the client half; NOT in src/contract)
export interface ExplorerState {
  readonly rootPath: string | undefined
  /** Node map by absolute path; the `dot` root lives here (path === rootPath). */
  readonly nodes: ReadonlyMap<string, TreeNode>
  /** Paths whose list request is in-flight (by path). */
  readonly loadingPaths: ReadonlySet<string>
  /** Single selected path. */
  readonly selectedPath: string | undefined
  /** Keyboard-focused path (separate from selection so refresh can restore focus). */
  readonly focusedPath: string | undefined
  /** Root generation; bump invalidates stale in-flight responses. */
  readonly rootGen: number
}

export interface ExplorerStore {
  readonly snapshot: () => ExplorerState
  readonly subscribe: (fn: () => void) => () => void
  // actions — pure, single source of truth:
  setRoot(path: string | undefined): void
  toggle(path: string): void
  expand(path: string): void
  collapse(path: string): void
  select(path: string | undefined): void
  focus(path: string | undefined): void
  /** Refetch every loaded/expanded directory (manual refresh, in place). */
  refreshExpanded(): Promise<void>
  /** Refetch one directory's children (used by expand). */
  loadChildren(path: string): Promise<void>
}
```

**Decisions:**
- **Single select** only in lite scope (no bulk actions today); the model leaves room for a `Set` later, but the API is path-scalar now.
- **Collapse does not unload** (§2.1): `collapse` sets `expanded=false`, leaves `loaded=true` with children in the map; re-`expand` renders from the map with no RPC. Manual refresh or root reset refetch.
- A directory with a **load error** stays in the map with `loadFailed` (still `loaded=false`); a re-expand retries instead of spinning.
- **Ownership:** all transitions live in this store; the component is a thin view. Every transition is unit-testable without a DOM (D8) and the stale-guard is trivially correct because the store serializes seq bumps.
- An initial footprint of ~tens of lines plus small reducers is the right “lite” size; no external state library.

---

## 7. Root selection (which directory does the tree show)

**Decision — resolution order, highest precedence first:**

1. **Active session's workspace path.** If `useSessions` → `SessionListState.current` resolves and the current `SessionSummary.cwd` is defined, use `cwd` as the root. Most contextually relevant (matches where the model works).
2. **The current workspace.** Else, from `useWorkspaces` → `WorkspaceListState.items`, the single currently-current workspace (the one the runtime selected via its projection sweep — `workspaces/service.ts`); use its `path`.
3. **The recent/only workspace.** Else, if `recentWorkspaceId` (or exactly one workspace in `items`), use that workspace's `path`.
4. **Empty state.** Else (no current session cwd, no current/recent/only workspace) → the tree shows the **empty state** (§8) with a message and an “Open Workspace” affordance. **Decision:** we do **not** fall back to `host.cwd` or the filesystem root by default — showing an arbitrary host directory the user never opened violates least-surprise. (`host.describe`.cwd is available but deliberately not a default root.)

**Precedence note:** steps 1 and 2 can conflict when the active session's cwd differs from the current workspace path → **the active session's cwd wins** (step 1 short-circuits); a later session switch re-resolves and resets the tree (§5.2).

**Implementation:** a pure selector `resolveRoot(sessions, workspaces) => string | undefined` re-evaluated whenever the workspace/session snapshots change (unit-testable, D8). Because the tab sits on a global slot with `useSessions`/`useWorkspaces`, the hook re-runs the selector on each snapshot change.

---

## 8. Error / empty / loading states

**Decision: two levels of error handling — top-level surface states (root) and per-node inline errors (expansion).**

```ts
/** Top-level tree view state (root node-level failures collapse here). */
export type ExplorerSurfaceState =
  | { readonly phase: 'no-workspace' }                        // root resolution returned undefined (§7)
  | { readonly phase: 'loading' }                             // root list in-flight
  | { readonly phase: 'loaded' }                              // root listed; tree renders
  | { readonly phase: 'root-error'; readonly error: ExplorerErrorCode; readonly message: string }
```

**Concrete handling (D7 renders; the contract):**
- **no-workspace:** empty tree + localized text + primary “Open Workspace” action; no list.
- **loading (root):** the root row shows a busy state; children absent until the response lands. **Decision:** no full-tree skeleton (lite).
- **root-error:** full-panel message with the mapped error + a **Retry** button (re-runs `loadChildren(root)`). Special-cased:
  - `not-found` / `not-directory` / `permission-denied` → specific message + Retry.
  - `permission-denied` at root is also where “path-deleted” is surfaced if the path vanished (below).
- **Per-node errors (expansion):** inline on the offending row with a retry affordance; the node stays in the map (§6) as `loadFailed`; a re-expand retries. Distinct visual treatment per code.

**path-deleted:**
- If it is the **root** (host returns `not-found` while the tab is open, e.g. a workspace dir removed) → root error “directory no longer exists” + Retry + a “Choose a different workspace” affordance.
- If it is a **non-root expanded node** → **prune it and its ancestors' children, keep the parent expanded, show an ephemeral toast** (D7). **Decision:** non-root path-deleted is non-fatal (prune + toast), because a deleted child is just an external edit; treating it as fatal would be hostile. Root path-deleted is fatal-for-the-tree (root error) because losing the root invalidates the whole view.

---

## 9. Keyboard & accessibility

Uses the WebAIM treeview pattern. Root = `role="tree"`; nodes = `role="treeitem"`; the children container of an expanded dir is a nested `<ul role="group">` (the node is its `aria-label`). Focus management = **roving tabindex** (one focused element has `tabindex=0`, all others `-1`).

**Required ARIA:**
- Tree: `role="tree"`, `aria-label` (“Explorer — <root basename>”).
- Node: `role="treeitem"`, `aria-expanded` (only on expandable nodes), `aria-selected` (single select). **Decision:** use nested `role="group"` children containers (cleaner than `aria-level` arithmetic for the lite UI).
- Selection changes are also announced via an `aria-live="polite"` visually-hidden region (for screen readers with weak `aria-selected` support).

**Keys (when a tree item has focus):**
- `ArrowDown` / `ArrowUp` — move focus to the next/previous **visible** node (respecting expansion).
- `ArrowRight` — on a collapsed expandable: expand and focus first child. On an expanded node: focus first child. On a leaf: no-op.
- `ArrowLeft` — on an expanded node: collapse, keep focus. Else: focus the parent.
- `Home` / `End` — first/last visible node.
- `Enter` / `Space` — on an expandable: toggle; on a leaf: select + (symlink/file) emit the open-file event (§10).
- `*` (asterisk) — expand the focused node and all descendants one level (recursion guard documented; D7 implements).
- `Delete` / `Backspace` — **not bound** (no destructive action in lite); explicit no-op.
- Mouse: click row → focus + select; click caret → toggle (does not move the selection); double-click dir → expand; double-click file → open-file event.

**Focus restoration:** re-renders preserve the `focusedPath`; if the focused node is pruned by a refresh, focus moves to its parent (or the tree root). **Decision:** the store holds `focusedPath` separately from `selectedPath` so refresh restores focus precisely.

---

## 10. Open-file event design (deferred editor)

There is no editor yet; we ship the **event contract** so future editors integrate without explorer changes.

**Decision:** a typed, subscribe-able event exposed on the client-side tab service, reachable through the D4 tab registry's service handle (proposed `ctx.betterSidebar`). Emitted when the user opens a file (Enter / double-click / an “open” command). Opening a directory emits the expand action, not this event.

```ts
/** Payload of an open-file event (no editor consumes it yet). */
export interface ExplorerOpenFileEvent {
  readonly path: string         // absolute resolved path
  readonly name: string         // display name
  readonly kind: 'file'         // always file from the tree's resolved view
  readonly source: 'keyboard-enter' | 'double-click' | 'command'
  readonly rootPath: string     // the tree root (a base for readers)
}

/** Subscribe face (part of the tab's exposed service). */
export interface ExplorerEvents {
  /** @returns disposer. */
  onOpenFile(listener: (e: ExplorerOpenFileEvent) => void): () => void
}
```

**Decision on default action when there is no subscriber:** none — “open” with no editor subscribed is a no-op (the row just becomes selected). We do **not** default to `workspaces.openPath` (OS-open is a separate, deliberate action owned by D1/D7; auto OS-opening on Enter would be surprising for a future-editor world). A future editor plugin subscribes via the tab registry and decides behavior; the explorer stays editor-unaware.

**Deferred (documented, not built):** editor registration, editor→tree reveal/focus-flash, and the inverse “reveal file in tree” event. Noted for a future design doc.

---

## 11. File placement (planned layout)

Proposed paths in the planned layout (aligns with the brief §3):

```
src/contract/explorer.ts          // §2 types + compareEntries + ExplorerConfig
src/contract/index.ts             // re-export * from './explorer' (plus git/transport re-exports by D3/D5)
src/client/explorer/state.ts      // §6 ExplorerStore + reducers
src/client/explorer/root.ts       // §7 resolveRoot(sessions, workspaces)
src/client/explorer/events.ts     // §10 event bus (Emitter + ExplorerEvents)
src/client/explorer/rpc.ts        // §2.5 adapter: RpcResult -> ExplorerResult + abort wiring
src/client/explorer/ExplorerPanel.tsx    // tab panel view (surface states + tree)
src/client/explorer/TreeNodeRow.tsx      // one row (indent, caret, icon, aria)
src/client/explorer/ExplorerPanel.module.css
src/host/explorer/list.ts         // host handler: validate -> readdir -> filter -> sort -> cap -> result
src/host/explorer/service.ts      // host service exposing list() for the rpc handler (D6 details)
tests/host/explorer/list.spec.ts  // host listing (temp-dir trees; D8)
tests/client/explorer/state.spec.ts           // store transitions + stale guard
tests/client/explorer/root.spec.ts            // resolveRoot precedence
tests/client/explorer/explorer-panel.client.spec.tsx  // component surface states (D8)
```

**Decision:** `compareEntries` lives in `src/contract/explorer.ts` (shared, pure, host-applied, testable from both sides). Store/root/events/rpc adapters live under `src/client/explorer/`; host list logic under `src/host/explorer/`. No explorer logic leaks into the tab registry or dock shell (D1/D4 own those).

---

## 12. Edge-case checklist

- Empty directory → expandable dir, zero children; caret toggles; nothing else.
- Nested symlink pointing into an ancestor of root → lists that ancestor; no auto-walk, so no cycle.
- Broken symlink → non-expandable `unknown` node; no RPC on expand.
- Permission-denied on a child of an open root → per-node inline error; parent stays expanded.
- Root listed, then the whole workspace dir deleted → root `not-found` → root error + “choose a different workspace”.
- Rapid root switches → `rootGen` guard discards stale responses.
- Expand + collapse + re-expand the same dir quickly → seq guard drops stale; collapse doesn't unload so re-expand is synchronous.
- A directory containing only `ignoreNames` entries → empty listing, no error.
- Dotfile with trailing-dot / unusual characters → hidden per the dot rule (`includeHidden` reveals); names never joined on the client.
- `includeHidden` toggle → re-request with the flag (re-fetch, not client-only restyle — §4.2, also open question #1).
- Selection on a node pruned by refresh → selection clears to `undefined`; focus moves to the parent (§9).
- Path with a trailing separator or mixed case on Windows → host normalizes (realpath canon) before identity; the client never normalizes.
- Concurrent list for two different dirs → both allowed; per-node seq keeps them isolated.

---

## 13. Open questions

1. **Hidden-toggle re-fetch vs client-side re-style.** §4.2 chose re-fetch on toggle. Alternative: always fetch hidden and only re-style client-side. Re-fetch keeps payloads small but costs a round-trip on toggle; the loopback transport makes latency trivial. Confirm with D5/D7.
2. **`allowedRoots` default.** §4.4 defaults to “allow any absolute path the host can read” (matches the brief). Confirm this is acceptable once D5 confirms the loopback fence genuinely scopes our channel.
3. **Single- vs future multi-select.** §6 chose single-select. If D3 (git) later needs bulk stage/discard it may push explorer multi-select. Accepted for lite; revisit if D3 insists.
4. **Should manual refresh re-validate the root against current workspace metadata?** Currently it only re-lists expanded dirs. If a workspace path changed without the tab resetting (an edge), a refresh could list a stale root. Confirm the reset-on-change behavior in §5.1 step 3 fully covers this, or whether manual refresh should also re-run `resolveRoot`.
5. **`host.cwd` fallback.** §7 explicitly avoids `host.cwd` as a default root. Confirm the product owner is comfortable that a fresh dsh with no workspace shows “Open Workspace” rather than the host working directory.
