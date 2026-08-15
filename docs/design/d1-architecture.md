# D1 — Overall Architecture & Module Boundaries

> **Design doc** for **dsh-better-sidebar-lite** — a right-side tabbed sidebar (explorer + git) that
> extends the DeepSeek Harness (dsh) **web GUI**. This is the architecture baseline every other design
> doc (D2–D8) builds on. It resolves module layout, data flow, overlay-dock integration, the tab
> registry service surface, package exports/scripts, and the shared error vocabulary.
>
> **Authoritative sources verified by reading:**
> - ../deepseek-harness/packages/client/ui-layout/src/client/AppFrame.tsx
> - ../deepseek-harness/packages/client/ui-layout/src/client/AppFrame.module.css
> - ../deepseek-harness/packages/client/ui-layout/src/client/index.ts (SlotMap + apply)
> - ../deepseek-harness/packages/client/ui-layout/src/client/columns.ts (panel constants)
> - ../deepseek-harness/packages/client/ui-slots/src/index.ts (register / kind semantics)
> - ../deepseek-harness/packages/client/runtime/src/client/index.ts (ClientContext merge)
> - ../deepseek-harness/packages/client/ui-jobs/src/client/index.ts (client plugin shape)
> - ../deepseek-harness/packages/client/connection/src/rpc.ts (RPC handle / call / authority)
> - ../deepseek-harness/packages/host/apiproxy/src/api/rpc.ts (RpcResult / RpcError)
> - ../deepseek-harness/packages/api/gateway/src/index.ts (~line 104, host inject-rpc pattern)
>
> Everything below is a **design**, not implementation. Type sketches are the API implementers build against.

---

## Table of contents
1. [Goals & non-goals](#1-goals--non-goals)
2. [Module & file layout](#2-module--file-layout)
3. [Data flow](#3-data-flow)
4. [Overlay-dock integration](#4-overlay-dock-integration)
5. [Tab registry service surface](#5-tab-registry-service-surface)
6. [package.json exports & scripts](#6-packagejson-exports--scripts)
7. [Shared error-code vocabulary](#7-shared-error-code-vocabulary)
8. [README contents](#8-readme-contents)
9. [Boundary assumptions about D2–D8](#9-boundary-assumptions-about-d2d8)
10. [Open questions](#10-open-questions)

---

## 1. Goals & non-goals

### 1.1 Goals
- One opinionated, thoroughly-verified architecture that D2–D8 slot into without friction.
- A **leaf** `shell.overlay` entry that owns the whole right dock; the dock owns the tab bar + panel
  area; the **tab registry** is a first-class extension point exposed on the client context.
- The host is a thin, dependency-light RPC server over the generic `/better-sidebar` channel ("lite").
  Data plane only; no business logic beyond fs/git access.
- A shared `src/contract` module imported by **both** host and client tsconfigs — a single source of
  truth for RPC payloads, models, and error codes.

### 1.2 Non-goals (out of scope here)
- Installing the plugin into the running dsh (no cordis.yml edits, no apps/web seeding). **Never.**
- Typert/remote services — **Decision:** use generic RPC channel (already chosen in brief §4.2, verified
  in `connection/src/rpc.ts`).
- Diff previews, editors, tree virtualization — owned by D2/D3 and deferred/out.
- CSS-in-JS or icon libraries — **Decision:** CSS modules + inline-SVG icons (dsh convention).

---

## 2. Module & file layout

### 2.1 Three compile units

| Unit | tsconfig | Source root | Runtime | Imports |
|------|----------|-------------|---------|---------|
| **contract** | both host & client | `src/contract` | types only | zero dsh runtime imports |
| **host** | `tsconfig.host.json` (`types:["node"]`) | `src/host` | Node | contract, dsh host deps, node builtins |
| **client** | `tsconfig.client.json` (`lib:[es2024,dom]`, jsx) | `src/client` | browser | contract, dsh client deps, react |

Contract is included by BOTH tsconfigs (both already `include` `src/contract/**/*.ts`). It must be
purely type + const-POJO code with **no** Node, DOM, or React types so both builds compile it identically.

**Cross-boundary rule (Decision):** `src/contract` imports nothing from `src/host`/`src/client`;
`src/host` and `src/client` import only dsh packages + node/buildins + `../contract`. Keeps one clean
dependency DAG and prevents server-only types leaking into the browser bundle.

### 2.2 Exact file tree

```
src/
  contract/                        # dependency-free shared types (no imports from src/*)
    index.ts                       # barrel: re-exports rpc, errors, tree, git, versions
    rpc.ts                         # endpoint names, request/response payload types, result framing
    errors.ts                      # BetterSidebarError union + mapping helpers
    tree.ts                        # explorer tree node model (see D2)
    git.ts                         # git status/log models (see D3)
    versions.ts                    # CHANNEL, CONTRACT_VERSION constants
  host/                            # Node/cordis plugin ("server" half)
    index.ts                       # entry: inject, Config, apply (registers RpcChannel + services)
    config.ts                      # Config schema (Schema.object) + defaults
    rpc.ts                         # RpcChannel: inject ['connection'], handle('/better-sidebar'), dispatch
    services/
      explorer-service.ts          # file-tree listing: readdir dirents, lazy children, sort, path safety
      git-service.ts               # git status/log: execFile wrapper, porcelain -z parsing, timeout/abort
      path-safety.ts               # root confinement + absolute/exists/dir validation
      errors.ts                    # host typed-error constructor + toRpcError mapper
  client/                          # browser/cordis plugin ("web" half)
    index.ts                       # entry: inject, apply (registers dock slot + tab registry + locales)
    rpc-client.ts                  # BetterSidebarRpc facade over ctx.connection.rpc.call + error mapping
    tab-registry/
      contract.ts                  # TabDef/TabID/registry API types (re-exported from index)
      service.ts                   # BetterSidebarTabRegistry impl + ctx.betterSidebar provide + persistence
    dock/
      dock.tsx                     # DockRoot — the single 'shell.overlay' entry
      dock.module.css
      dock-store.ts                # width/collapsed/active tab store (useSyncExternalStore)
      rail.tsx                     # collapsed rail (48px) + rail.module.css
      resize.ts                    # pointer-based width drag (AppFrame handle pattern)
    tabbar/
      tablist.tsx  tabpanel.tsx  tablist.module.css
    tabs/
      explorer/  explorer-tab.tsx  tree.tsx  tree.module.css
      git/       git-tab.tsx  status-view.tsx  log-view.tsx  git.module.css
    icons.tsx                      # tiny inline-SVG icons (folder/file/git/branch/chevron/refresh/close)
    locales.ts                     # en/zh dictionaries + NS + LocaleNamespaceMap merge
    styles.css                     # CSS variable tokens for dark/light + color-scheme
  css-modules.d.ts                 # (already present)
```

### 2.3 What each module exposes

```ts
// src/host/index.ts (entry — exposed as pkg ".")
export { name }                     // 'dsh-better-sidebar-lite'
export { Config }                   // cordis Schema object (config.ts)
export const inject = ['connection']
export function apply(ctx: Context): void
```

```ts
// src/client/index.ts (entry — exposed as pkg "./client")
export const inject = ['connection', 'slots', 'locale']
export function apply(ctx: ClientContext): void
export type { BetterSidebarService, BetterSidebarTabRegistry, TabDef, TabID } from './tab-registry/contract'
```

```ts
// src/contract/index.ts (entry — exposed as pkg "./contract")
export * from './versions'
export * from './rpc'
export * from './errors'
export * from './tree'
export * from './git'
```

**Decision — the slot surface is deliberately ONE entry.** The dock registers one `shell.overlay`
entry (`id:'better-sidebar'`). Explorer and git are tabs *inside* that dock, contributed via the tab
registry, **not** separate slots. Rationale: `shell.overlay` is a `list` slot (kind list, scope root,
verified in ui-layout `index.ts`) — every entry renders side-by-side at layer level, which fits
independent overlays but not the shared width/collapse/active-tab state of a tabbed dock. The tab
registry (§5) is the correct seam.

---

## 3. Data flow

### 3.1 End-to-end (client tab → RPC → host service → fs/git → back)

```
[Tab component]                     [ctx.betterSidebar]
 explorer-tab / git-tab   -->       tabs.select(id)  /  tabs.*  (dock renders active panel)
        |
        |  reads tab-local state via props; triggers ctx.betterSidebar.rpc.call(endpoint, payload, {signal})
        v
   ctx.connection.rpc.call( CHANNEL, endpoint, payload, signal )      [browser]
        |
        |  (WebSocket/SSE transport envelope)
        v
   [Host] RpcChannel.dispatch(endpoint, payload, signal)
        |
        v
   explorer-service.list() / git-service.status()/log()
        |
        v
   node:fs/promises (readdir)  +  child_process.execFile('git', fixedArgs, {cwd, timeout})
        |
        |  handle failures -> BetterSidebarError -> toRpcError (RpcResult)
        v
   RpcResult<T>  -- transport -->  ctx.betterSidebar.rpc.call resolves {ok:true,value} | {ok:false,error}
```

### 3.2 Client RPC facade (`src/client/rpc-client.ts`)

```ts
export const CHANNEL = '/better-sidebar'            // from src/contract/versions.ts

export interface BetterSidebarRpc {
  call<E extends BetterSidebarEndpoint>(
    endpoint: E,
    payload: BetterSidebarReq[E],
    opts?: { signal?: AbortSignal },
  ): Promise<BetterSidebarResult<BetterSidebarRes[E]>>
}

export function createBetterSidebarRpc(connection: ClientConnectionHandle): BetterSidebarRpc {
  return {
    async call(endpoint, payload, opts) {
      const res = await connection.rpc.call(CHANNEL, endpoint, payload, opts?.signal)
      if (!res.ok) return { ok: false, error: mapRpcErrorToBetterSidebar(res.error) }
      return { ok: true, value: res.value as never }
    },
  }
}
```

The facade is created once in `apply` and stored on `ctx.betterSidebar.rpc` (§5). Tabs call exclusively
through it — never importing `@deepseek-ai/dsh-client-connection` directly — keeping them transport-
agnostic and giving one choke point for abort and stale-response guards (D5).

### 3.3 Host channel registration (`src/host/rpc.ts`) — verified pattern

```ts
// Mirrors packages/api/gateway/src/index.ts (~line 104) and dp client-connection host plugin.
export const inject = ['connection']                // host ctx.connection (client-connection host half)

export function registerRpcChannel(ctx: Context): void {
  ctx.inject(['connection'], (connectionCtx) => {
    ctx.effect(() => {
      const disposer = connectionCtx.connection.rpc.handle(
        CHANNEL,
        (endpoint, payload, signal) => dispatch(endpoint, payload, signal),
        { authority: 'loopback' },
      )
      return () => { void disposer() }
    }, 'better-sidebar: rpc channel')
  })
}
```

**Decision — authority `loopback`:** any first-contact browser payload is untrusted input to the local
filesystem. `loopback` is the strongest authority the connection layer offers a browser caller
(`ConnectionRpcAuthority = 'trusted-host' | 'loopback'`, verified in connection/src/rpc.ts); combined
with host `path-safety.ts` this is the documented trust boundary. (D5 refines payload validation; D6
owns path-safety specifics — here we fix the channel + authority.)

### 3.4 Host dispatch (whitelist → service)

```ts
async function dispatch(endpoint: string, payload: unknown, signal: AbortSignal): Promise<RpcResult<unknown>> {
  switch (endpoint as BetterSidebarEndpoint) {
    case 'explorer/list':     return run(() => explorer.list(validate(ExplorerListReq, payload), signal))
    case 'explorer/children': return run(() => explorer.children(validate(ExplorerChildrenReq, payload), signal))
    case 'git/status':        return run(() => git.status(validate(GitStatusReq, payload), signal))
    case 'git/log':           return run(() => git.log(validate(GitLogReq, payload), signal))
    default:
      return { ok: false, error: { code: 'bad-request', message: 'unknown endpoint: '+endpoint, details: { issues: [] } } }
  }
  // run() catches BetterSidebarError -> toRpcError; unknown throws -> transportError (internal).
  // signal is forwarded so fs/git reads can abort.
}
```

### 3.5 Data-flow invariants
1. Client never touches `node:fs`/git; host never touches React/DOM.
2. One logical channel, one routing table; endpoints declared only in `src/contract/rpc.ts`.
3. Every browser request goes through `ctx.betterSidebar.rpc` — no ad-hoc `connection.rpc.call`.
4. Host forwards the caller's `AbortSignal` into fs/git so cancellation propagates.

---

## 4. Overlay-dock integration

This section fixes the hardest part — where and how the right dock lives. Decisions are anchored to the
verified frame implementation.

### 4.1 Frame reality (verified)

- `AppFrame.tsx` renders a CSS grid (`grid-template-columns: sidebar center details`), then a sibling
  `<div className={css.overlayLayer} data-shell-overlay>{renderSlot('shell.overlay', {})}</div>`.
- `AppFrame.module.css`:
```css
.overlayLayer { position: absolute; inset: 0; z-index: 20; pointer-events: none; }
.overlayLayer > * { pointer-events: auto; }   /* children opt back in automatically */
```
  The `.frame` is `position:relative`, anchoring absolute children.
- Slot declared as `'shell.overlay': { kind: 'list'; scope: 'root' }` (ui-layout `index.ts`). As a list
  slot, our entry adds a fresh `id` **beside** existing entries — we add, never replace/dedupe.
- Concession constants (`columns.ts`): `SIDEBAR_AUTO_COLLAPSE = 1024`, `SIDEBAR_COLLAPSED = 56`,
  `DETAILS_DEFAULT = 360`, `DETAILS_MAX = 520`, `CENTER_MIN = 640`.

### 4.2 Position/size strategy

**Decision: fixed-width, fixed-height, resizable-width right panel INSIDE the overlay layer — it does
not modify the details column track.**

- `position:absolute; top:0; right:0; bottom:0`, width persisted (default 320px, clamp [260, 560]).
- The dock runs the full frame height. It never negotiates with `ctx.layout` details geometry.
- Uses the frame's `ResizeObserver`-derived width for narrow behavior (§4.5).

```css
/* src/client/dock/dock.module.css */
.dockRoot {
  position: absolute; top: 0; right: 0; bottom: 0;
  width: var(--bs-dock-width, 320px);
  display: flex; flex-direction: column;
  border-left: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-specific-sidebar-fill);
  box-shadow: -2px 0 8px rgba(0,0,0,.12);   /* lift over the details column / content */
  z-index: 1;                              /* above sibling overlay entries within the layer */
  pointer-events: auto;                    /* explicit; though .overlayLayer > * already sets it */
}
```

### 4.3 Overlay vs the details column

**Decision: the dock renders ABOVE the details column**. The overlay layer (`z-index:20`) covers every
column; while our dock is open at far right, it overlays (covers) the built-in details column when that
is also open. We do **not** read `ctx.layout` details width or push the details track — that is the
frame's own grid/concession solver, which we must not fight. Both are optional surfaces; we accept
overlay semantics and document it. (If the owner wants them to share width, that is Open Question #1.)

### 4.4 Collapse-to-rail behavior

**Decision:** collapsing the dock leaves a **48px rail** pinned to the right edge (analogous to the
frame's `SIDEBAR_COLLAPSED = 56`). The rail shows tab glyphs (a column of small icons) and re-expands on
click. This is dock-internal state (`collapsed` in dock-store), not a slot change — the single
`id:'better-sidebar'` entry stays mounted, just narrower. The frame therefore sees exactly ONE occupant
whether expanded or collapsed.

### 4.5 Narrow-viewport behavior

**Decision: hide (rail-only) below a breakpoint**, mirroring how the frame auto-collapses the sidebar
under `SIDEBAR_AUTO_COLLAPSE = 1024`.

- A `ResizeObserver` on the dock gives frame width; when `frameWidth < NARROW_BREAKPOINT`, render
  rail-only.
- **Decision: `NARROW_BREAKPOINT = 900`** (a "lite" right sidebar stays out of the way on small screens).
  D7 may refine the exact value; here we fix the mechanism: rail-only while mounted, never unmount.
- On widening past the breakpoint, restore the prior expanded state; manual re-expand is a user gesture
  (rail click / keyboard).

### 4.6 Opting back into pointer events

**Decision:** because `.overlayLayer > * { pointer-events:auto }`, our dock root is already interactive if
it is the **direct child** the layer renders. The dock root is the single click-through opt-in point;
every interactive element must be a DOM descendant INSIDE `.dockRoot`. We set `pointer-events:auto` on
`.dockRoot` explicitly for clarity. The empty remainder of the layer stays click-through, so the app
under the dock remains usable everywhere except exactly where the dock paints.

**Rule for D7:** no interactive element may leak outside `.dockRoot` (portal-based modals need care —
flag in D7).

### 4.7 z-index within the layer

**Decision:** `.dockRoot { z-index:1 }`. The layer is shared (`shell.overlay` is additive); our dock is
"chrome" and sits at z-1 so future sibling overlay entries (toasts, badges) that declare a higher z/order
may still float in front. Document our dock as chrome, siblings as transient badges.

---

## 5. Tab registry service surface

### 5.1 `ctx.betterSidebar` (client) — Decision

**Decision: expose exactly ONE service on the client context: `ctx.betterSidebar`.** Pattern mirrors
`ui-layout/src/client/index.ts` (`ctx.layout`) and the runtime (`ctx.slots` / `ctx.sessions` /
`ctx.workspaces`): `declare module` merge into `@deepseek-ai/cordis`'s `Context` + provide via
`ctx.reflect.provide` inside an effect.

```ts
// src/client/index.ts (relevant fragments)
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Outward face; concrete service stays inside this plugin. */
    betterSidebar: BetterSidebarService
  }
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const rpc = createBetterSidebarRpc(ctx.connection)
    const tabs = new BetterSidebarTabRegistry({ persist: true })
    ctx.betterSidebar = { rpc, tabs }
    // built-in tabs register through the SAME public API a third party would use:
    tabs.register(createExplorerTabDef(ctx))             // D2
    tabs.register(createGitTabDef(ctx))                  // D3
    ctx.slots.register({ name: 'shell.overlay', id: 'better-sidebar', order: 0 }, DockRoot)
    return () => { /* teardown disposers */ }
  }, 'better-sidebar: dock + registry + rpc')
}
```

### 5.2 API shape (`src/client/tab-registry/contract.ts`)

```ts
export interface BetterSidebarService {
  readonly rpc: BetterSidebarRpc              // from rpc-client.ts (§3.2)
  tabs: BetterSidebarTabRegistry
}

export interface TabDef {
  id: TabID                                   // stable unique id, e.g. 'explorer' | 'git'
  icon: (() => React.ReactNode) | React.ReactNode   // inline SVG (icons.tsx)
  label: string | (() => string)              // locale-aware when a fn
  badge?: () => number | string | undefined   // e.g. git dirty count (D4 semantics)
  order?: number                              // lower sorts first
  renderPanel: () => React.ReactNode          // active-tab content
}

export interface BetterSidebarTabRegistry {
  register(def: TabDef): () => void           // returns disposer
  unregister(id: TabID): void                 // no-op if absent
  active: TabID | undefined
  select(id: TabID): boolean                  // false if id unknown
  ids(): readonly TabID[]                     // ordered snapshot
  get(id: TabID): TabDef | undefined
  subscribe(fn: () => void): () => void       // dock subscribes for re-render
}
```

**Decision:** the dock is the single consumer; it renders `tablist` + the active `renderPanel` by
subscribing to registry changes. The built-in explorer/git tabs register through the same public API a
third party would use, proving the extension point end-to-end (the documentation commitment of §8.6 and
the owner's hard requirement #1).

### 5.3 Tab registry on the host? — Decision

**Decision: no host service.** The tab registry is purely a client/UI concern; the host surface is exactly
the RPC channel + config. Adding a host `ctx.betterSidebar` would be speculative abstraction AND would
require RPC just to list tabs. If a future tab needs host-only data it adds endpoints (D5), not a host
service. Reflected in README/ADRs.

---

## 6. package.json exports & scripts

### 6.1 Exports — verified mismatch, Decision

The scaffolded `exports` maps `types` to `lib/types/...` and `default` to `lib/<unit>/index.js`. dsh
packages use `lib/types/**` because they bundle with **tsdown** (e.g. `@deepseek-ai/dsh-client-ui-jobs`
→ `"types": "lib/types/index.d.ts"`, emitted by tsdown). This project compiles with plain `tsc`
(`outDir: lib`, both tsconfigs), which emits `.d.ts` **next to** the `.js` — e.g. `lib/host/index.d.ts` —
NOT under `lib/types/`. **Decision: keep tsc; align the export `types` paths with what tsc actually
emits.** Keep the three subpath names unchanged (`.`, `./client`, `./contract`).

```json
{
  "main": "lib/host/index.js",
  "types": "lib/host/index.d.ts",
  "exports": {
    ".":          { "types": "./lib/host/index.d.ts",     "default": "./lib/host/index.js" },
    "./client":   { "types": "./lib/client/index.d.ts",   "default": "./lib/client/index.js" },
    "./contract": { "types": "./lib/contract/index.d.ts", "default": "./lib/contract/index.js" },
    "./package.json": "./package.json"
  }
}
```

No `lib/contract` collision: both tsconfigs share `outDir: lib` but emit disjoint trees (
`lib/host`, `lib/client`, `lib/contract`). D8 must confirm the first `pnpm build` produces exactly these
paths before implementation locks the map.

### 6.2 Scripts — Decision

Keep the existing scripts (`build`, `typecheck`, `test`, `test:watch`, `test:coverage`, `lint`, `clean`);
they are already correct for the workflow. **Skip** adding `dev`/watch scripts by default — no new
tooling or bundler. The only package.json edit required by this doc is the `types`/`exports` fix above.

---

## 7. Shared error-code vocabulary

### 7.1 Contract types (`src/contract/errors.ts`)

**Decision:** define a plugin-owned, transport-agnostic `BetterSidebarError` union in contract. The host
maps it to dsh `RpcError` at the boundary; the client facade maps back. This gives a typed, extendable
vocabulary WITHOUT widening dsh's closed `RpcError` (the `RpcErrorDetailsMap` is closed — verified in
packages/host/apiproxy/src/api/rpc.ts).

```ts
export type BetterSidebarErrorCode =
  | 'E_BAD_REQUEST'       // malformed payload / unknown endpoint
  | 'E_ROOT_DENIED'       // path outside allowedRoots / not absolute / not a dir
  | 'E_READ_FAILED'       // fs readdir/stat failure
  | 'E_NOT_FOUND'         // target path missing
  | 'E_TOO_MANY_ENTRIES'  // depth/entry cap exceeded (D6)
  | 'E_GIT_NOT_FOUND'     // git binary missing on PATH
  | 'E_NOT_A_REPO'        // not inside a git work tree
  | 'E_GIT_ERROR'         // git command failed (D6 maps exit/stderr)
  | 'E_CANCELLED'         // caller aborted
  | 'E_INTERNAL'          // unexpected host failure

export type BetterSidebarError = { code: BetterSidebarErrorCode; message: string }

export type BetterSidebarResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: BetterSidebarError }
```

### 7.2 Mapping to/from dsh RpcError (`src/host/services/errors.ts`)

**Decision — a stable, lossless mapping** so the client reconstructs the typed union without string
parsing.

```ts
export function toRpcError(e: BetterSidebarError): RpcError {
  switch (e.code) {
    case 'E_BAD_REQUEST': return { code: 'bad-request', message: e.message, details: { issues: [] } }
    case 'E_CANCELLED':   return { code: 'cancelled',   message: e.message, details: {} }
    default: return { code: 'internal', message: e.message, details: { __bs: e.code } }
  }
}

export function mapRpcErrorToBetterSidebar(r: RpcError): BetterSidebarError {
  if (r.code === 'bad-request') return { code: 'E_BAD_REQUEST', message: r.message }
  if (r.code === 'cancelled')   return { code: 'E_CANCELLED',   message: r.message }
  if (r.code === 'internal' && r.details?.__bs) return { code: r.details.__bs, message: r.message }
  return { code: 'E_INTERNAL', message: r.message }
}
```

**Decision:** signal cancellation is surfaced by the transport as `cancelled` → `E_CANCELLED`; the
client's stale-response guard (D5) treats aborted calls as non-errors. `details.__bs` is a private
wire marker, not public contract. Keep the code set small; extend only as D2/D3/D6 justify.

---

## 8. README contents

**Decision — sections, in order:**

1. **What it is** — one-paragraph pitch + a small ASCII mock.
2. **Architecture summary** — pointer to `docs/architecture-brief.md` + data-flow diagram (§3) + module
   map (§2).
3. **Model Experience** (owner/hard requirement) — the intended UX across explorer + git.
4. **Installing this into a dsh web deployment later** — since we never install it now, document the
   exact steps: copy the built entry, register the plugin in the host cordis config with `inject`, ensure
   the client entry is in the browser bundle, and that the `shell.overlay` slot exists. State the channel
   (`/better-sidebar`) and authority (`loopback`).
5. **Config reference** — host `Config` fields (`allowedRoots`, `gitTimeoutMs`, `maxTreeDepth`,
   `maxLogEntries`) with defaults + trust-boundary note.
6. **Extension guide — add a tab** — walkthrough using `ctx.betterSidebar.tabs.register(...)`.
7. **Error codes** — the `BetterSidebarErrorCode` table.
8. **Development** — `pnpm install/build/typecheck/test/lint`, note junctions to the dsh checkout.

---

## 9. Boundary assumptions about D2–D8

The following are decisions I am **assuming** the other design docs take. If one chooses differently, my
architecture still holds but the file/type names below may shift — call that out in review.

- **D2 (Explorer):** tree model in `src/contract/tree.ts`; endpoints `explorer/list` + `explorer/children`;
  the root shown = active session workspace path (or a chosen root), decided by D2. I keep that decision
  here (no competing root logic in the architecture).
- **D3 (Git):** `git/status` + `git/log`; model in `src/contract/git.ts`; `E_GIT_*`/`E_NOT_A_REPO` as typed
  states (not crashes). Diff/actions scope decided by D3.
- **D4 (Tab registry):** my §5 `BetterSidebarTabRegistry` is the API; D4 defines exact `TabDef` semantics
  (badge, order, persist, dispose, active-tab persistence, locale) and the minimal third-party example. I
  assume active-id + width + collapsed persist via localStorage/sessionStorage.
- **D5 (Transport contract):** endpoint vocabulary + request/response types in `src/contract/rpc.ts`;
  validation approach (I recommend a tiny per-endpoint guard, NOT schemastery, for "lite" — D5 decides);
  concurrency, abort/timeout, stale-response guard. I assume the exact endpoint names I sketched.
- **D6 (Host services):** implements `explorer-service`, `git-service`, `path-safety`, hosts `toRpcError`
  and enforces `allowedRoots`. I assume node builtins only (no dsh fs deps).
- **D7 (Client UI):** builds `dock.tsx`, rail, resize, tabbar, and the two tab panels on my slots/types.
  D7 owns CSS token conventions; my §4 size/z-index/narrow rules are the contract D7 follows.
- **D8 (Testing):** vitest projects already split host(node)/client(jsdom) — aligns with my layout. D8 owns
  the tier map and fixtures; I assume plugin-apply tests use the dsh client test-runtime (reference:
  `packages/client/ui-jobs/tests/browser-plugin.client.spec.ts`).

---

## 10. Open questions

1. **Details-column coexistence** — Should the dock ever share width with the open details column (push it),
   or is overlay-over-details acceptable? I chose overlay to stay decoupled; owner input wanted if
   details+dock both open is a primary UX flow.
2. **Narrow threshold** — `NARROW_BREAKPOINT = 900` is my pick; D7 may tune. Confirm with owner for small
   laptop targets.
3. **Persistence medium** — localStorage vs sessionStorage vs dsh settings for {width, collapsed, active
   tab}. D4 to decide; I default to localStorage (survives reload, cheap).
4. **Validation style** — my tiny per-endpoint guard vs schemastery (dsh uses it on host). If schemastery,
   contract must stay dependency-free — put the schema on the host side instead.
5. **`shell.overlay` id uniqueness** — the layout says "a fresh id beside shipped entries"; confirm ours
   (`'better-sidebar'`) does not collide and that third parties pick their own (D4).
6. **Icon source** — our inline SVG (`icons.tsx`) vs reuse `ui-primitives/src/icons`. D7 decides; this doc
   assumes our own tiny set for "lite" self-containment.
7. **Emitted-path confirmation** — verify `pnpm build` emits `lib/contract/index.js` for the `./contract`
   export (both tsconfigs include contract; confirm no overwrite collision). D8.






