# D4 — Tab Registry: The Extensibility Extension Point

> Design doc for **dsh-better-sidebar-lite**. Author: D4 design subagent.
> Companion docs: D1 (architecture), D2 (explorer), D3 (git), D5 (RPC), D6 (host), D7 (dock UI), D8 (testing).
> This doc is the contract for how a **tab** registers into the right-docked sidebar.

## 1. Scope and goal

The sidebar exposes a **tab bar** (tablist/tab/tabpanel semantics, see D7). The **tab registry** is the
mechanism a plugin uses to contribute a tab. It is deliberately a *small*, dependency-free service on the
**client** context — no host involvement, no RPC — so third parties can add tabs without touching the host half.

Design decisions (the owner folds these into docs/adr/*.md):

- **Decision:** the registry lives on the **client** context as `ctx.betterSidebar.tabs`.
- **Decision:** tabs are **root-scoped** (scope `'root'`), not session-scoped, for v1. The dock is a single root-level
  surface (`shell.overlay`), so tabs render once per dock, not per session. Session facts reach a tab via the standard
  framework hooks, exactly as any root-scoped slot entry (§9). A future per-session tab is a later feature.
- **Decision:** the `active` tab is **persisted** in ONE tiny `localStorage` key (§5). The single allowed registry persistence.
- **Decision:** a tab's own strings live in **its own locale namespace** via `ctx.locale.register` (dsh pattern, §6); the
  registry only ever needs the **active tab's label** and passes label ownership down to the tab author.

## 2. Where the registry lives

Mirror the dsh service-provide pattern exactly (`packages/client/ui-layout/src/client/index.ts` lines 26–31 and 116–120):
ui-layout does `const layout = new LayoutController()` then inside `ctx.effect(() => { const dispose =
ctx.reflect.provide('layout', layout); ... })` and augments `@deepseek-ai/cordis` with
`interface Context { layout: ILayout }`.

```ts
// src/client/index.ts (our client plugin entry)
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Docked right-sidebar facade: tab registry + a few dock toggles (see D7). */
    betterSidebar: import('./tab-registry/service.ts').ITabRegistryFacade
  }
}

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const disposeProvide = ctx.reflect.provide('betterSidebar', createTabRegistryFacade(ctx))
    const disposeDock = registerDock(ctx) // D7: registers into 'shell.overlay'
    return () => { disposeDock?.(); disposeProvide() }
  }, 'betterSidebar: service + dock')
}
```

> **Note on `inject`:** providing a context member is done via `ctx.reflect.provide`. ui-layout injects
> `['slots', 'theme']` and uses `ctx.reflect.provide` without declaring `reflection` in `inject`; how `ctx.reflect`
> becomes available to a consumer plugin is verified as an open question (§14). `slots` and `locale` are injected
> because the dock (D7) registers into `shell.overlay` and built-in / example tabs register their locales.

**Decision:** one service object owns both the tab registry and the (tiny, D7) dock toggles, so there is a single
`ctx.betterSidebar` face. §3 defines `ITabRegistryFacade`.

### Folder layout (client half)

```text
src/client/
  index.ts                     # plugin entry: provide ctx.betterSidebar + register dock (D7)
  tab-registry/
    service.ts                 # TabRegistry class + ITabRegistryFacade + source wiring
    source.ts                  # createTabsSource(): the list subscription snapshot source
    contract.ts                # TabRegistrationOpts, TabDefinition, TabPanelProps (public types)
    errors.ts                  # TabRegisterError + codes
    builtin.ts                 # registerBuiltinTabs(ctx): explorer + git reference impls
  tabs/                         # owned by other design docs (D2 explorer, D3 git)
    explorer/
    git/
```

## 3. Public registration API

Modeled on `ctx.slots.register` (disposer returned, tied to the caller's `ctx.effect` fiber) and `ctx.locale.register`
(disposer returned, duplicate throws). The registry imports shared types **type-only** from
`@deepseek-ai/dsh-client-ui-slots`; it has zero runtime dependencies on the slot/locale packages (bundle purity).

### 3.1 The registration function and options

```ts
// src/client/tab-registry/contract.ts
import type { ComponentType } from 'react'

/** Plain tab id: kebab/lowercase, scoped to the dock namespace. */
type TabId = string

/** Mount scope — v1 accepts only 'root' (throws otherwise). 'session' is reserved for a future feature. */
type TabMountScope = 'root' | 'session'

/** Icon: a tiny inline-SVG component (dsh has no icon library — brief §4.5). */
export type TabIconComponent = ComponentType<{ className?: string }>

/** The one registration call a tab author makes. */
export interface TabRegistrationOpts {
  /** Stable unique id (throws on duplicates, §4). Kebab-case, e.g. 'git-status'. */
  id: TabId
  /** Tab-bar order. Lower shows first. Undefined = after all explicit orders; ties by registration order (§4). */
  order?: number
  /**
   * Tab-bar title. A `{ ns, key }` pair resolves this tab's label through its own locale namespace;
   * a literal string is used verbatim. Prefer the locale-keyed form (see §6).
   */
  title: { ns: string; key: string } | string
  /** Icon component rendered in the tab bar. */
  icon: TabIconComponent
  /** The panel body rendered when this tab is active (see §9 for its props). */
  panel: ComponentType<TabPanelProps>
  /** Optional badge descriptor (style); value is supplied later via setBadge (see §7). */
  badge?: BadgeDescriptor
  /** Optional accelerator label, normalized lowercase, e.g. 'ctrl+shift+e' (see §8). */
  shortcut?: string
  /** Mount scope; only 'root' is accepted in v1 (throws otherwise). Defaults to 'root'. */
  scope?: TabMountScope;
}

/** Badges: a count or a dot; value supplied later via setBadge (§7). */
export type BadgeDescriptor =
  | { kind: 'count' }
  | { kind: 'dot' }

/** Props the shell passes EVERY panel component. §9 defines what stays EMPTY for v1. */
export interface TabPanelProps {
  /** The tab's own id (authoritative; prefer over any closure copy). */
  tabId: TabId;
}
```

### 3.2 Register / dispose semantics

```ts
export interface ITabRegistryFacade {
  /** Register a tab; returns an idempotent disposer. In a plugin, call inside `ctx.effect` so fiber-unload
   * disposes automatically; the returned disposer covers manual teardown and tests. Throws on duplicate id (§4). */
  readonly register: (opts: TabRegistrationOpts) => () => void
  /** Read the current immutable snapshot (stable reference between changes). */
  readonly getSnapshot: () => TabsSnapshot
  /** Subscribe to snapshot changes (registration, disposal, badge, active). Returns unsubscribe. */
  readonly subscribe: (fn: () => void) => () => void
  /** Select the active tab (writes persistence, §5). No-op if the id is not registered. */
  readonly setActive: (id: TabId) => void
  /** Set the badge value for a live tab (no-op if unknown). */
  readonly setBadge: (id: TabId, value: number) => void
  readonly clearBadge: (id: TabId) => void;
}
```

- **Decision:** `register` throws synchronously on **duplicate id** (§4) — fail loud at registration, not silently at render.
- **Decision:** disposal removes the tab and, if it was active, triggers active-tab fallback (§5). It is idempotent
  (second dispose is a no-op). Its badge value disappears with it.
- **Decision:** the registry does **not** throw on a *shortcut* collision (§8) — it resolves first-wins and nothing breaks.

### 3.3 How registration flows (the copybook every tab follows)

```ts
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const disposeTab = ctx.betterSidebar.tabs.register({
      id: 'todo-list',
      order: 30,
      title: { ns: 'todo', key: 'tab.title' },
      icon: TodoIcon,
      panel: TodoPanel,
    })
    const disposeDict = ctx.locale.register('todo', { zh, en }) // §6 — author owns both
    return () => { disposeTab(); disposeDict() }
  }, 'todo-list: tab')
}
```

> **Note:** `register` does NOT auto-register the locale namespace — the author owns both (see §6).

### 3.4 The TabDefinition (registry-held record)

```ts
/** Immutable resolved entry the dock shell renders (part of TabsSnapshot). */
export interface TabDefinition {
  id: TabId
  /** Null when the caller supplied no numeric order (sorts last, then by registrationIndex). */
  order: number | null
  /** Resolved title: the literal, or a bound translate function (identity stable per namespace).
   * The registry NEVER caches a translated string — it re-resolves the active title at render time,
   * so a locale switch re-derives it. See §6. */
  title: string | ((key: string, params?: Record<string, unknown>) => string)
  /** Icon component (stable reference). */
  icon: TabIconComponent
  /** Panel component (stable reference); the shell mounts it only while the tab is active (§9, D7). */
  panel: ComponentType<TabPanelProps>
  badge: { kind: 'count' | 'dot'; value: number } | null
  shortcut: string | undefined
  scope: TabMountScope
  /** Monotonic registration index — the tie-break after `order`. */
  registrationIndex: number;
}
```

**Decision:** the registry holds **components** (not element factories) so the shell can mount/unmount panels
cheaply and lazy-mount inactive tabs (D7 decides the mount policy).

## 4. Ordering / conflicts

1. **Sort key** = (`order ?? Number.POSITIVE_INFINITY`, `registrationIndex`). Entries without `order` sort after all
   explicit ones; among equal `order` (including all no-order entries), **registration order wins** (lower `registrationIndex` first).
2. **Duplicate id → throw.** `register` throws `TabRegisterError({ code: 'duplicate-id' })` BEFORE mutating state.
   The message carries the offending id and the existing registrant label (if provided). This is the one hard conflict.
3. **Shortcut collision → resolve, do NOT throw** (§8): first-registered (lowest registrationIndex) wins; the loser keeps
   its tab but its `shortcut` becomes inert.
4. **Badge overwrite is by id** (a later setBadge replaces); no ordering concept on badges.
5. **Re-registering the same id after disposal is allowed** (the stale entry is gone).

**Edge cases:**
- Registering while the id still exists (its disposal not yet run): the idempotent disposer must complete before a
  subsequent register with the same id returns. Cordis effects dispose in order; enforce the live-map check at the throw
  site and document that register-immediately-after-dispose is safe.
- Two plugins use the same id → the second throws by design (fail loud) rather than the dock showing two tabs with one label.
- `undefined` `order` vs explicit ties → deterministic via registrationIndex; no randomness.

## 5. Active-tab state and persistence

- **Decision:** the registry owns `activeId`, held in the same snapshot as the tab list (§10). The dock reads it via
  the subscription; the tab bar calls `setActive(id)`.
- **Decision:** persist `activeId` in ONE localStorage key: `dsh.betterSidebar.activeTab`. Value is the raw tab id string;
  absent key ⇒ default. Recommended over no-persistence because the tab bar is reloaded often and this is one line with a
  clean fallback. Storage is read/written by the registry through a single, isolated function (§10) — this avoids importing
  the runtime persistence middleware into the registry.
- **Default tab:** the first tab in sorted order (lowest sort key) — also the deterministic birthday of the dock.
  Not configurable in v1 (no config plumbing; open question §14 if the owner wants one).
- **Tab disappears (dispose) while active:** fall back to the **first remaining** tab in sorted order (same rule as default).
  If none remain, `activeId` becomes `undefined` and the dock renders an empty state (D7).
- **Persisted id no longer exists on load:** treated like the disappear case — fall back to the first remaining; do NOT
  write the fallback to storage until the user actively selects (avoid storage thrash on transient unload). On the next
  explicit selection the new active id is written.

**Edge cases:**
- activeId persists across reload; the owning plugin is slow to register → activeId is effectively 'pending' until the
  first tab lands; the fallback rule runs the moment the first registration arrives.
- A plugin upgrade renames an id: stale storage id ⇒ fallback, then the user re-picks. Acceptable for v1.
- Corrupted storage value: wrap reads in try/catch, treat as absent. Never crash the dock on a bad key.
## 6. Locales

dsh pattern verified (`packages/client/locale/src/client/index.ts`): each feature owns a namespace via
`ctx.locale.register(ns, { zh, en })` returning a disposer; the namespace is merged into
`@deepseek-ai/dsh-client-ui-slots`'s `interface LocaleNamespaceMap`. The ui-jobs plugin
(`packages/client/ui-jobs/src/client/locales.ts`) is the copybook: `export const NS = 'job'`; `zh` is `{ ... } as const`
(source of truth); `en: Record<JobKey, string>`; `type JobKey = keyof typeof zh`.

**Decision:** every tab owns its book of strings via a namespace it registers. The registry:
- never bikesheds generic label keys — it only needs the **active** tab's title string.
- resolves a title-keyed tab by calling the bound translate `(key, params)` on the ACTIVE locale at render time; it does
  NOT cache the translated string, so a locale switch re-resolves (mirrors the LocaleFace revision ride, ui-slots renderer.ts lines 18–28).
- does **not** register a 'tab registry' namespace of its own unless the dock shell (D7) needs a few shell strings
  (aria labels, etc.) — those go in a `betterSidebar` namespace the D7 author owns, NOT in this registry.

**Decision:** for `title: { ns, key }`, the registry binds the namespace once at registration via `ctx.locale.bind(ns)`
(the runtime `LocaleRuntime.bind`, line 265 of the locale index) and stores the stable function — identity stable per
namespace, so memoized components don't lose memoization (exactly what dsh relies on). It never runs its own lookup; it delegates.

**Edge cases:**
- title.ns is registered lazily after the tab → the label falls back to the raw key until the dict lands (dsh returns the
  key itself on a miss, per locale `lookup`, lines 284–287).
- A literal string title is used verbatim and never translated — documented as 'for dev/boot copy only; ship locale-keyed titles.'.
- Two tabs sharing one namespace is fine (the namespace is owned by its dictionary owner; tab labels are keys within it).

## 7. Badges

Not a v1 requirement; included as a first-class, minimal contract so a later tab (e.g. git uncommitted count) has a place
to put a value without reshaping the API.

- **Decision:** badge is opt-in at registration (`badge: { kind: 'count' | 'dot' }` describes the *style*); its **value** is
  set later via `setBadge(id, n)` / `clearBadge(id)`. No value flows through the registration options — the author can't know
  it at setup time.
- The dock renders the value per kind: `count` shows the number, `dot` shows a dot when > 0.
- Updating a badge for an unknown id is a silent no-op (unknown tab → nothing to badge; fail-loud would be hostile to an async update path).
- Badge state is NOT persisted (derived, ephemeral). It resets on reload and is re-supplied by the tab's own data flow.

## 8. Keyboard shortcut

Optional. The registry stores it for the dock to (a) toggle to the tab and (b) render a hint.

- **Decision:** shortcut is free-form text normalized to lowercase (e.g. 'ctrl+shift+e'); the registry does NOT bind keys
  itself (keyboard handling is D7's concern — it owns the global keydown listener). The registry only stores + dedupes.
- Collision: first-registered wins; later collisions keep their entries but drop the binding. A tab re-registering after
  disposal re-claims the shortcut (it is now first, in registration order).
- Deliberately v1-light: no persistence of shortcuts, no remapping.

## 9. Props the shell passes to a tab panel (test seam)

This is the **test seam**: a third-party tab component's props contract must be stable and minimal so it can be tested in
jsdom without a running dock.

- **Decision:** for v1 the shell passes an EMPTY business surface. `TabPanelProps = { tabId: string }` only. No theme, no
  workspace info, no context object injected by the registry.

Rationale:
- Tabs get real framework data the dsh way: a panel rendered inside the dock can import `useSessions` / `useWorkspaces`
  directly — those global hooks are available to any component, not just slot entries (AppFrame uses `useSessions`; D7's dock
  likewise). Passing workspace/session as props would duplicate the standard kit and add a dependency the registry doesn't need.
- Theme and dock-relative sizing arrive via CSS variables on the body (brief §4.5) and the dock's own container classes — not props.
- Keeping props to `{ tabId }` means a tab is trivially testable: render `<ExplorerPanel tabId="explorer" />` standalone in jsdom,
  no dock, no registry.

- **Decision:** if any v1 tab genuinely needs the dock's live geometry or the active-tab flag, it should arrive through a **hook**
  the dock context provides (D7), NOT an expanded props interface. Props stay frozen; the seam stays stable.

**Edge cases:**
- A panel that reads a hook for session-maybe data must handle `undefined` (no session) — same contract as any session-maybe
  component; the registry does not gate this.
- A panel throwing at render → the dock (D7) decides whether to error-boundary it; the registry does not touch component errors
  (that's slot-machinery territory, and the registry isn't one).
## 10. Store shape and subscription mechanism

**Decision: use the simpler `HostObservable`-style source (getSnapshot/subscribe) — not the full immer snapshot-store.**

The registry's state is tiny and, to components, read-only (writes come only from the service). A plain listeners `Set`, an
immutable snapshot object, and a version bump give dependency-free, trivially unit-testable state that still composes with
the dock's renderer exactly like the locale/slots faces (both use getSnapshot/subscribe, ui-slots renderer.ts lines 30–34).

dsh offers `createSnapshotStore` (runtime contract/store.ts lines 86–92) with selector hooks and opt-in persist; adopting it
would pull the runtime dependency and its persist into a one-field registry. **Resolution:** keep the registry dependency-free;
if a future version needs selector hooks, migrate the snapshot to `createSnapshotStore` behind the same getSnapshot/subscribe
face (no caller change).

```ts
// src/client/tab-registry/source.ts
export interface TabsSnapshot {
  /** Sorted tab records (§4), immutable, replaced on change. */
  tabs: readonly TabDefinition[]
  /** Active tab id, or undefined when no tabs remain. */
  activeId: TabId | undefined
  /** Monotonic change counter (registration, disposal, badge, active). */
  revision: number;
}

/** Minimal observable source consumed by the dock (uSES-safe). */
export interface TabsSource {
  getSnapshot(): TabsSnapshot;
  /** Notified on every snapshot change; returns unsubscribe. */
  subscribe(fn: () => void): () => void;
  /** Internal writes (service-only; not exposed on the public facade). */
  _emit(next: TabsSnapshot): void;
}
```

The service (§3.2) holds a `TabsSource`; the dock shell (D7) binds a `useTabs` selector hook over it — the renderer-side
uSES bridge, same shape as `PropsStore`'s `useStore` in ui-slots store.ts lines 123–125. The facade's `getSnapshot`/`subscribe`
are plain delegations. **Persistence** (`dsh.betterSidebar.activeTab`, §5) lives in one helper in `service.ts` that
reads on boot and writes on `setActive`, with try/catch around both.

**Testing seam:** because the source is plain getSnapshot/subscribe and the service is an ordinary class, unit tests drive
it without React: register → assert snapshot; dispose → assert snapshot + activeId fallback; duplicate → assert throw.
Component tests (D8) render a tab panel standalone (`tabId` only, §9). No real dock is needed for any registry test.

## 11. Built-in tabs: explorer and git as the reference implementation

The two shipped tabs ARE the registry's own test of the contract — they must satisfy every rule below, so any third-party
tab following them is correct:

1. Register inside `ctx.effect` with a disposer, and co-register their locale namespace (D2/D3).
2. Unique kebab ids: `'explorer'` and `'git'`, with concrete `order` — explorer `10`, git `20` (explorer first by default).
3. Title via `{ ns, key }` — explorer namespace `'explorer'`, git namespace `'git'` (each owns `tab.title` + its panel keys).
4. Icon as a tiny inline-SVG component in `src/client/icons.tsx`.
5. Panel component takes exactly `{ tabId }` and reads workspace/session via framework hooks + its own RPC service (D5/D6) —
   proving no extra props are needed.
6. Git tab may opt into `badge: { kind: 'count' }` and `setBadge('git', n)` when a later feature exposes uncommitted counts (D3).
7. Explorer `shortcut: 'ctrl+shift+e'`; git `'ctrl+shift+g'` (D7 binds them).

```ts
// src/client/tab-registry/builtin.ts
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { ExplorerPanel, explorerIcon, explorerNS } from '../tabs/explorer'
import { GitPanel, gitIcon, gitNS } from '../tabs/git'

export function registerBuiltinTabs(ctx: ClientContext): Array<() => void> {
  const disposers: Array<() => void> = []
  ctx.effect(() => {
    const d1 = ctx.betterSidebar.tabs.register({
      id: 'explorer', order: 10, title: { ns: explorerNS, key: 'tab.title' },
      icon: explorerIcon, panel: ExplorerPanel, shortcut: 'ctrl+shift+e', scope: 'root',
    })
    const d2 = ctx.betterSidebar.tabs.register({
      id: 'git', order: 20, title: { ns: gitNS, key: 'tab.title' },
      icon: gitIcon, panel: GitPanel, badge: { kind: 'count' }, shortcut: 'ctrl+shift+g', scope: 'root',
    })
    disposers.push(d1, d2)
    return () => { d2(); d1() } // LIFO
  }, 'betterSidebar: builtin tabs')
  return disposers
}
```

**Decision:** a built-in tab must NOT special-case anything in the registry — it cannot reach into `_emit` or private state.
If a built-in needs a capability the contract lacks, that's a contract bug to surface in D2/D3 (and fold back here), never a
hack around the API.

## 12. Error codes

Registry-local errors mirror dsh's fail-loud style (structured, thrown at the failure point).

```ts
// src/client/tab-registry/errors.ts
export type TabRegisterErrorCode =
  | 'duplicate-id'
  | 'invalid-title'     // empty title, or empty ns/key
  | 'unsupported-scope' // scope !== 'root' in v1
  | 'invalid-icon'      // icon missing / not a component

export class TabRegisterError extends Error {
  readonly code: TabRegisterErrorCode;
  readonly tabId: string;
  constructor(code: TabRegisterErrorCode, tabId: string, detail?: string) {
    super(detail ?? 'tab-registry: ' + code + ' for "' + tabId + '"');
    this.name = 'TabRegisterError';
    this.code = code;
    this.tabId = tabId;
  }
}
```

These are **synchronous, developer-facing** errors (a third-party register call), not RPC errors — they belong in
`src/contract` only if the host ever needs them; the registry stays client-only.

## 13. README section outline — 'Adding a tab'

The README will host a short, copy-paste section:

1. **Scope** — what a tab is (icon + title in the bar, a panel body). One paragraph.
2. **Minimal example** — the full `apply` body from §3.3 (register + locale + effect + disposer) plus a placeholder `Panel` /
   `Icon`, so a reader can copy one file.
3. **Options table** — id / order / title / icon / panel / badge / shortcut / scope, one line each; note `title` is locale-keyed.
4. **Locales** — how to own a namespace (`ctx.locale.register`, NS/zh/en/Key pattern) and merge it into `LocaleNamespaceMap`;
   link ui-jobs as the dsh copybook.
5. **Ordering & conflicts** — `order` + registration tie-break; duplicate id throws (`TabRegisterError` code list); shortcut resolves first-wins.
6. **Props in, props out** — panel receives only `{ tabId }`; read session/workspace via framework hooks; keep props frozen.
7. **Active tab & persistence** — one `localStorage` key; fallback when a tab disappears.
8. **Testing** — render the panel standalone with `tabId`; the registry is fully unit-testable without React.

## 14. Open questions

- **`ctx.reflect.provide` availability for a consumer plugin** — ui-layout injects `['slots', 'theme']` and uses
  `ctx.reflect.provide` without declaring `reflection`; verify whether a consumer plugin can provide `ctx.betterSidebar`
  the same way, or must expose the facade via another channel (e.g. the plugin loader's service declaration).
- **Default-tab configurability** — v1 hardcodes 'first in sorted order'; a configurable default (host Schema) is deferred.
  Confirm the owner is happy with no config for v1.
- **Panel lazy-mount vs always-mount** — the registry holds components, so the dock chooses; D7 decides whether inactive
  panels stay mounted (state retention) or unmount on switch. The registry assumes neither.
- **Badge for git 'uncommitted count'** — D3 decides whether git actually supplies it in v1; the badge mechanism here
  already supports it either way.
