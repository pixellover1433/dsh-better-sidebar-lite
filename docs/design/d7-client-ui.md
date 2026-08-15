# D7 — Client UI: Dock Shell & Tabs

> Design doc for **dsh-better-sidebar-lite**. Audience: implementer subagents (cannot see this
> conversation) — reads as self-contained. Everything here references verified dsh facts; the
> cited files' paths are under the read-only checkout `../deepseek-harness`. No production code.
>
> Status: final for v1. Open questions at the end.

---

## 0. Scope

This doc owns the **browser-side chrome**: the right-docked overlay shell, its tabs, resize /
collapse interactions, styling, shared empty/loading/error surfaces, a11y, locale dictionaries,
the tab-registry integration hook, and the test seam for the dock.

It does **not** own: the RPC transport (D5), the host explorer/git services (D6), the tab-registry
API shape itself (D4 — this doc consumes what it states), or the per-tab business components (D2/D3
provide ExplorerTab / GitTab as pluggable components; this doc only hosts them). Where this doc needs
a piece owned by D4 (tab descriptor, registry hook), it states the dependency contract it expects
and links to D4 as the authority; where D4 and D7 disagree, D4 is the source of truth for the
registry API, and D7's document is the consumer contract for the component props + labels.

---

## 1. Verified dsh facts this design builds on

Read these to confirm before implementing (paths relative to `../deepseek-harness`):

| Fact | Source file | Notes |
| --- | --- | --- |
| `shell.overlay` is a **list**, **root-scope** slot; entries opt back into pointer events | `packages/client/ui-layout/src/client/index.ts` (SlotMap), `AppFrame.tsx` (render site) | The overlay layer div is `position:absolute; inset:0; z-index:20; pointer-events:none`; its direct children get `pointer-events:auto` (`AppFrame.module.css` lines 110-119). |
| Root-scope slot components receive **GlobalStandardProps**: `useSessions`, `useWorkspaces` | `packages/client/runtime/src/client/index.ts` lines 145-150 | No `sessionId`/session kit on a root slot. |
| Slot registration API | `packages/client/ui-slots/src/index.ts` (`SlotCore.register`), `packages/client/runtime/src/client/slots.ts` (`SlotRegistry.register`) | List kind needs `id`; optional `order`, `label`, `locale`, `priority`. Registering into an undeclared slot throws; `shell.overlay` is declared by ui-layout's AppFrame. |
| Client plugin shape | `packages/client/ui-jobs/src/client/index.ts` | `inject` array + `apply(ctx)` + `ctx.effect` wrapping, `ctx.slots.register`, locale `declare module` merge. |
| Locale registration | `packages/client/locale/src/client/index.ts` `LocaleRuntime.register(ns, {zh,en})` | Typed form requires every shipped locale (`zh` + `en`); duplicate (ns,locale) throws. |
| CSS modules convention + dark-theme attribute | `packages/client/ui-sidebar/src/client/SidebarRoot.module.css`, `packages/client/ui-layout/src/client/theme-presenter.ts` | dsh exposes `body[data-ds-dark-theme]` and token variables; we use our own `--bsd-*` tokens with `prefers-color-scheme`. |
| Pointer-capture resize pattern | `packages/client/ui-layout/src/client/AppFrame.tsx` `DragHandle` (lines 40-84) | `setPointerCapture`, rAF-throttled `dx`, release on pointerup; `touch-action: none` on the handle. |

Key takeaways encoded in this design:

- **We register into `shell.overlay`, never into `root`**, because `root` is a single slot and a
  second entry shadows the AppFrame (verified comment, `runtime/src/client/slots.ts` lines 25-40).
- Because `shell.overlay` is **list** kind, multiple overlay entries coexist; our dock must be an
  additive entry with a unique `id: 'better-sidebar'`.
- The overlay layer is **click-through by default**; our root must set `pointer-events: auto`.
- Dark/light: we optionally read `body[data-ds-dark-theme]`; see the `Decision` in section 4.

---

## 2. Component tree & file layout

### 2.1 Files (exact paths under `src/client/`)

```
src/client/
  index.ts                       # plugin entry: ctx.effect -> register() into shell.overlay + locale register
  dock/
    RightSidebarDock.tsx         # overlay entry root; renders DockFrame; owns prop derivation
    DockFrame.tsx                # fixed-right frame: width state, resize handle, collapse rail
    DockFrame.module.css
    DockState.ts                 # pure reducer + localStorage persistence helpers (testable, no React)
    TabBar.tsx                   # role=tablist; active tab; icon rail when collapsed
    TabBar.module.css
    TabPanel.tsx                 # renders the active tab's component; role=tabpanel
    DockPanel.module.css
  explorer/
    ExplorerTab.tsx              # D2-owned component; re-exported here as the shipped tab
    (D2 owns the tree internals under explorer/)
  git/
    GitTab.tsx                   # D3-owned component; re-exported here as the shipped tab
  shared/
    Spinner.tsx / Spinner.module.css
    EmptyState.tsx / EmptyState.module.css
    ErrorState.tsx / ErrorState.module.css   # ErrorState with retry callback
    icons.tsx                    # tiny inline-SVG icon components (no icon lib in dsh)
    useTheme.ts                  # body[data-ds-dark-theme] flag hook (section 4)
  locales.ts                     # NS + zh + en dictionaries + BetterSidebarKey type
```

The two shipped tabs (ExplorerTab, GitTab) live under D2/D3's ownership but are mounted by D7's
TabPanel. D7 only defines the **component slot contract** a tab must satisfy; D2/D3 implement against
it. Any third-party tab (via D4 registry) must satisfy the same contract.

### 2.2 Component tree

```
ctx.slots.register({ name:'shell.overlay', id:'better-sidebar', order: 0, locale: NS }, RightSidebarDock)
  RightSidebarDock (receives GlobalStandardProps + t + injected business props)
    -- DockFrame
         |-- TabBar (tablist; collapsed => icon rail)
         |    +-- TabButton[i] (role=tab) - one per registered tab, in registry order
         |-- collapse/expand toggle button
         |-- resize handle (pointer events, min..max width)
         +-- when expanded: TabPanel (role=tabpanel)
              +-- activeTab.component({ /* TabContextProps */ })
```

### 2.3 Responsibilities (single responsibility)

- **RightSidebarDock** - the thin adapter between the slot framework and `DockFrame`. It derives
  the composed props (registry snapshot, global hooks, t) and owns which tab is active (v1: default
  explorer, section 8). It renders `DockFrame` with a fully resolved prop bag - no business logic
  past prop derivation.
- **DockFrame** - pure presentational shell. Owns dock geometry state: open/collapsed flag and width
  (section 3). Renders header (toggle + tab rail), the resize handle, and the active panel. No
  knowledge of explorer/git.
- **TabBar** - renders the tablist from a snapshot of registered tabs; collapses to an icon-only
  vertical rail. No knowledge of what a tab does.
- **TabPanel** - mounts the active tab's component, passing the session/workspace context. Remounts
  per active tab (key = tab id) so each panel starts clean; see section 7 for a11y wiring.
- **DockState** - pure geometry reducer + storage read/write helpers, unit-testable without React.

---

## 3. Dock state: open/collapsed/width

### 3.1 The state model

There are **two independent geometry dimensions**:

1. **expanded vs collapsed (rail)** - a boolean. Collapsed shows only the tab-icon rail at far
   right; expanded shows full tab bar + active panel.
2. **width (expanded px)** - only meaningful while expanded.

Collapse is **not** "width = 0" (we keep a rail). This mirrors the left sidebar's `collapsed`
boolean, but the right dock keeps its own semantics (we are an overlay; there is no AppFrame grid
track to ride).

### 3.2 Decision: where the state lives

**Decision:** Geometry state lives in **local React state inside `DockFrame`**, seeded from and
written back to **`localStorage`** under a single namespaced key, e.g. `'betterSidebar.dock:v1'`
holding `{ open: boolean; width: number }`. Justification:

- The state is pure UI geometry, owned by one component; lifting it into a cordis service or the
  slot store adds ceremony with no cross-plugin consumer (only our dock reads it).
- `localStorage` persistence gives the wanted UX (recall last width/expanded across reloads) with
  zero server/RPC involvement, and is trivially testable (jsdom provides `localStorage`).
- We do **not** persist through dsh's settings-scope machinery: that is for durable preferences the
  host mirrors; dock geometry is a per-browser-viewport nicety. Keep it out of the host write path.

Concrete shape (in `DockState.ts`, pure, testable):

```ts
// src/client/dock/DockState.ts
export interface DockGeometry { open: boolean; width: number }

export const DOCK_DEFAULT: DockGeometry = { open: false, width: 320 }
export const DOCK_MIN_WIDTH = 240
export const DOCK_MAX_WIDTH = 640
export const DOCK_RAIL_WIDTH = 56                   // collapsed rail strip width
export const DOCK_STORAGE_KEY = 'betterSidebar.dock:v1'

/** Clamp a raw width to the [MIN, MAX] band. */
export function clampDockWidth(width: number): number {
  if (!Number.isFinite(width)) return DOCK_DEFAULT.width
  return Math.min(DOCK_MAX_WIDTH, Math.max(DOCK_MIN_WIDTH, Math.round(width)))
}

/** Parse a persisted payload; any malformation falls back to the default. */
export function parseDockGeometry(raw: string | null): DockGeometry {
  if (raw === null) return DOCK_DEFAULT
  try {
    const parsed = JSON.parse(raw) as { open?: unknown; width?: unknown }
    if (typeof parsed.width !== 'number') return DOCK_DEFAULT
    return { open: parsed.open === true, width: clampDockWidth(parsed.width) }
  } catch { return DOCK_DEFAULT }   // malformed JSON -> default (never throw)
}

export function serializeDockGeometry(g: DockGeometry): string {
  return JSON.stringify({ open: g.open, width: clampDockWidth(g.width) })
}
```

DockFrame wiring (sketch):

```tsx
// src/client/dock/DockFrame.tsx (sketch)
export function DockFrame(props: DockFrameProps): JSX.Element {
  const [geom, setGeom] = useState(() => parseDockGeometry(
    typeof localStorage === 'undefined' ? null : localStorage.getItem(DOCK_STORAGE_KEY),
  ))
  // Persist on every change, but tolerate unavailable storage (SSR/privacy mode).
  useEffect(() => {
    try { localStorage.setItem(DOCK_STORAGE_KEY, serializeDockGeometry(geom)) }
    catch { /* quota/denied: keep in-memory state only */ }
  }, [geom])

  const setOpen = useCallback((open: boolean) => setGeom(g => ({ ...g, open })), [])
  const setWidth = useCallback((w: number) => setGeom(g => ({ ...g, width: clampDockWidth(w) })), [])
  // render...
}
```

Edge cases:
- **localStorage write throws** (private mode / quota): swallow and keep in-memory state. Never
  crash the dock over a width preference.
- **Corrupt stored JSON / stale version**: `parseDockGeometry` falls back to `DOCK_DEFAULT`;
  the versioned key lets us migrate or drop old shapes later.
- **Rapid resize / write blur**: width is clamped at set time, so we never persist an out-of-band
  width.

---

## 4. Interaction: resize, collapse toggle, ESC, keyboard shortcut

### 4.1 Resize (pointer events)

**Decision:** reuse the AppFrame `DragHandle` idiom: a fixed, `touch-action:none` hit strip on the
dock's **left edge** (the dock is at the right of the screen), using pointer capture + rAF-throttled
movement, clamped to `[DOCK_MIN_WIDTH, DOCK_MAX_WIDTH]` = [240, 640], default 320 (which is
`DOCK_DEFAULT.width`).

```tsx
// Sketch of the resize handle (inside DockFrame)
function DockResizer(props: { width: number; onResize: (w: number) => void }): JSX.Element {
  const origin = useRef(0); const startW = useRef(0)
  const [dragging, setDragging] = useState(false)
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    origin.current = e.clientX; startW.current = props.width
    setDragging(true)
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    props.onResize(startW.current + (origin.current - e.clientX)) // left edge: dx negated
  }
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDragging(false)
  }
  return <div className={css.resizer} data-dragging={dragging || undefined}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} />
}
```

Notes:
- Movement math: dragging the **left** edge right shrinks the panel, so `onResize(startW + (origin - x))`.
- Optional rAF throttle is acceptable to omit for v1 (a 640px-max panel is cheap to relayout).
  **Decision:** direct calls are fine for v1; add rAF only if profiling shows jank.
- `touch-action: none` on the handle (required for touch drag; AppFrame does the same).
- While `dragging`, set `data-dragging` on the frame to disable width transitions (mirrors
  AppFrame.module.css lines 15-17: easing would detach the edge from the pointer).
- **Click-through during drag:** the handle holds pointer capture during an active drag, so the
  conversation underneath is unaffected; after release the shell.overlay pointer-events rules apply.

### 4.2 Collapse toggle

- One toggle button, always visible, in the dock header row.
- Expanded state: a "collapse to rail" button (chevron-right glyph).
- Collapsed (rail) state: a "expand" button (chevron-left glyph), at the top of the rail.
- Toggling can be instant or animated; v1 uses a 150ms crossfade/slide matching the left-sidebar
  affordance, respecting prefers-reduced-motion. **Decision:** keep it a simple width transition that
  settles on the rail; no freeze-then-fade (that pattern exists because the left sidebar rides a grid
  track; we are a fixed overlay).
- **Decision:** collapsed keeps the rail mounted (icons only). The active-tab panel unmounts while
  collapsed (width is the rail), remounts on expand. The tab owns its data via RPC + in-memory cache;
  it must tolerate unmount/remount.

### 4.3 ESC to close

**Decision:** **No ESC handler for v1.** The dock is not a modal; closing via keyboard has the
Ctrl/Cmd+Shift+B path below, and a global ESC listener risks intercepting ESC meant for inline
editors or dialogs elsewhere in the app. Document as a future enhancement behind a feature flag.

### 4.4 Keyboard shortcut (toggle)

**Decision:** ship a **single, documented toggle shortcut**: **Ctrl/Cmd+Shift+B**, mirroring typical
sidebar toggles. Implementation lives in the plugin `apply` (section 8), not across every component:

```ts
// in plugin apply (src/client/index.ts) - sketch
ctx.effect(() => {
  const onKey = (e: KeyboardEvent): void => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyB') {
      e.preventDefault()
      toggleFromKeyboard()   // calls the dock via the shared open-state channel (section 8)
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, 'better-sidebar: toggle shortcut')
```

- **Decision:** only call `preventDefault` when our shortcut matches, so we never swallow other
  combos. No text-field guard needed for Ctrl/Cmd (global chord modifiers).
- Documented in the README (owner's job) and in an a11y note.
- If a tab registers its own keys later (D4), they must not collide with Ctrl/Cmd+Shift+B.

---

## 5. shell.overlay integration & pointer-events / stacking

Verified behavior (AppFrame.module.css lines 110-119):

```css
.overlayLayer { position:absolute; inset:0; z-index:20; pointer-events:none; }
.overlayLayer > * { pointer-events: auto; }
```

### 5.1 Our opt-in

**Decision:** our dock **root element** sets `pointer-events: auto` (as a direct child of the
overlay layer, the `.overlayLayer > *` rule already grants it). Crucially we do **not** render a
full-page scrim - the dock is not a modal, so pointer events over the conversation remain
click-through (our root box does not cover them).

- Expanded: the dock root covers only the dock's own box (right edge, its width).
- Collapsed: the dock root is exactly the rail strip (`DOCK_RAIL_WIDTH`) wide:
  `width: 56px; height: 100%; position: fixed; right: 0; top: 0; pointer-events: auto;`.

```css
/* DockFrame.module.css (sketch) */
.root {
  position: fixed;
  top: 0; right: 0;
  height: 100%;
  pointer-events: auto;      /* opt back into the click-through overlay layer */
  z-index: 20;               /* matches the overlay layer's own z; child still above the columns */
  display: flex;
  flex-direction: row;       /* content column + resize hit strip */
}
.root.expanded { width: var(--bsd-width-expanded); }  /* inline style sets actual px */
.root.collapsed { width: var(--bsd-rail, 56px); }
```

### 5.2 Blocking the conversation when collapsed - the key rule

**Decision:** when collapsed, only the 56px rail occupies the right edge. The conversation column
underneath is not overlapped on typical widths; where the rail does overlap the underlying edge, the
user loses only an out-of-focus 56px right strip. This is the accepted trade-off for a docked rail
and matches how the details column behaves. We do **not** try to shrink the grid tracks (we are an
overlay; we do not own layout).

Note: D1 decides the dock **overlays** the conversation (never pushes it); this doc assumes overlay.
If D1 changes to "sits beside / pushes", the fixed-right overlay positioning here must be revisited.

### 5.3 Stacking / z-index notes

- Dock root uses `position: fixed; z-index: 20` inside the overlay layer (already z-20). Because
  our root is a stacking child of the overlay, and the overlay is the top layer of the frame, the
  dock paints above the sidebar/center/details columns by construction.
- **Edge collision:** the details column sits at the far right of the grid; our dock floats above it.
  Acceptable (resize handles / scrollbars live above). D1 notes the interplay.
- **Tooltips/popovers rendered by tab components** must escape the dock's clipping. Panels should
  avoid `overflow: hidden` on ancestors of fixed-position floats; use `position: fixed` roots or
  portal to `document.body` (above the z-20 stack) so they are never clipped.

---

## 6. Styling system: CSS modules + --bsd-* tokens

### 6.1 Convention

- CSS Modules exclusively (`*.module.css`), matching dsh (`SidebarRoot.module.css`). No CSS-in-JS.
- A small token set declared as CSS custom properties on the dock root (`--bsd-bg`, `--bsd-border`,
  `--bsd-text`, `--bsd-muted`, `--bsd-accent`, ...). Children reference these variables; the root
  supplies defaults that adapt to light/dark.

### 6.2 Decision: dark detection

**Decision:** detect dark mode via **CSS `prefers-color-scheme`** as the base, and **also** read
`body[data-ds-dark-theme]` (dsh's theme-presenter sets/removes this attribute) to track the app's
explicit theme. A small `useTheme()` hook (in `shared/useTheme.ts`) returns whether the dock
should render dark, preferring the attribute and falling back to the media query.

```ts
// src/client/shared/useTheme.ts (sketch)
const DARK_ATTR = 'data-ds-dark-theme'
export function useDark(): boolean {
  const [dark, setDark] = useState(() => resolveDark())
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(resolveDark()))
    mo.observe(document.body, { attributes: true, attributeFilter: [DARK_ATTR] })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const mqHandler = (e: MediaQueryListEvent): void => {
      if (!document.body.hasAttribute(DARK_ATTR)) setDark(e.matches)
    }
    mq.addEventListener('change', mqHandler)
    return () => { mo.disconnect(); mq.removeEventListener('change', mqHandler) }
  }, [])
  return dark
}
function resolveDark(): boolean {
  if (document.body.hasAttribute(DARK_ATTR)) return true
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}
```

The dock root sets a theme-data attribute the CSS consumes:

```tsx
<div className={css.root} data-bsd-dark={dark || undefined}>...</div>
```

Token block (in `DockFrame.module.css`):

```css
.root {              /* light defaults */
  --bsd-bg: #ffffff; --bsd-border: rgba(0,0,0,0.12); --bsd-text: #1f2328;
  --bsd-muted: #656d76; --bsd-accent: #0969da; --bsd-bg-hover: rgba(0,0,0,0.04);
  --bsd-rail-bg: #f6f8fa; color-scheme: light;
}
.root[data-bsd-dark] {   /* dsh explicit dark */
  --bsd-bg: #0d1117; --bsd-border: rgba(255,255,255,0.15); --bsd-text: #e6edf3;
  --bsd-muted: #8b949e; --bsd-accent: #4493f8; --bsd-bg-hover: rgba(255,255,255,0.08);
  --bsd-rail-bg: #161b22; color-scheme: dark;
}
@media (prefers-color-scheme: dark) {   /* OS-dark fallback when no dsh attribute */
  .root:not([data-bsd-dark]) {
    --bsd-bg: #0d1117; --bsd-border: rgba(255,255,255,0.15); --bsd-text: #e6edf3;
    --bsd-muted: #8b949e; --bsd-accent: #4493f8; --bsd-bg-hover: rgba(255,255,255,0.08);
    --bsd-rail-bg: #161b22; color-scheme: dark;
  }
}
```

Because `[data-bsd-dark]` has higher specificity than the OS media block, an explicit dsh dark theme
wins; the media query is the fallback when dsh is unset. We use our own `--bsd-*` tokens rather than
importing dsh's `--dsw-*` alias tokens (the brief section 4.5 says for "lite" use a small custom set
and document that host tokens can be adopted later).

- **`prefers-reduced-motion: reduce`**: disable all transitions/animations (copy the pattern from
  SidebarRoot.module.css lines 274-283 and AppFrame.module.css lines 19-23).
- Icons: tiny inline SVGs in `shared/icons.tsx`; per-tab rail icons come from the tab descriptor
  (D4), not hardcoded in the dock.
- Rail width `--bsd-rail: 56px` matches JS `DOCK_RAIL_WIDTH` (documented single source is JS).

---

## 7. Accessibility

### 7.1 Region semantics (not a modal)

**Decision:** the dock is a page **region**, not a dialog, so it uses **`role="region"`** (or
`complementary`) with an `aria-label` - **not** a dialog, and **no focus trap**.

- **Decision:** use `role="region"` + `aria-label` set from the locale (e.g. "Sidebar"); a docked
  tool region reads most truthfully as a labeled region. `complementary` is also defensible; pick
  `region` for v1 and keep it consistent.
- **No focus trap** - the user must tab past/away to the conversation; trapping would make the
  non-modal feel modal. We only move focus implicitly on tab switch (below).

### 7.2 Tablist semantics

- Container: `role="tablist"`, `aria-label` from locale ("Panels").
- Each tab: `role="tab"`, `aria-selected={active}`, `tabIndex={active ? 0 : -1}`,
  `id="bsd-tab-{id}"`, `aria-controls="bsd-panel-{id}"`; only the active tab is in the tab order
  (roving tabindex).
- Panel: `role="tabpanel"`, `id="bsd-panel-{id}"`, `aria-labelledby` = the active tab's id,
  `tabIndex={0}` (reachable). Only the active panel is mounted, so `aria-hidden` is moot for
  siblings.
- Keyboard: **Left/Right arrows** move focus between tabs and **activate on arrow**, plus Home/End.
  **Decision:** arrow activation (not Tab-key) because these are tool panels, not form wizards.
- Trees/lists inside a panel (explorer tree, git list) own their own keyboard nav per WAI-ARIA tree/
  grid; that is D2/D3's component responsibility. The dock only provides the `tabpanel` container.

### 7.3 Focus management on tab switch

- When the active tab changes, move focus to the new panel root unless the change came from a click
  on the tab itself (already focused). Implement a small effect in TabPanel: on mount, if prior focus
  was inside the old panel, move focus to this panel's `tabIndex=0` root.

### 7.4 Landmarks & labels

- All `aria-label` values come from `t(...)`, never hardcoded.

---

## 8. Locale

### 8.1 Pattern (verified against ui-jobs and ui-sidebar)

Namespace `betterSidebar`. Dictionaries live in `src/client/locales.ts`; zh is the key-set source
of truth, en is key-identical.

```ts
// src/client/locales.ts
export const NS = 'betterSidebar'

export const zh = {
  'region.label': '侧边栏',
  'tablist.label': '面板',
  'toggle.collapse': '收起侧边栏',
  'toggle.expand': '展开侧边栏',
  'empty.title': '暂无内容',
  'empty.hint': '这里还没有可显示的内容',
  'error.title': '加载失败',
  'error.retry': '重试',
  'retry.hint': '点击重试以再次加载',
} as const

export type BetterSidebarKey = keyof typeof zh

export const en: Record<BetterSidebarKey, string> = {
  'region.label': 'Sidebar',
  'tablist.label': 'Panels',
  'toggle.collapse': 'Collapse sidebar',
  'toggle.expand': 'Expand sidebar',
  'empty.title': 'Nothing here',
  'empty.hint': 'There is nothing to show yet',
  'error.title': 'Failed to load',
  'error.retry': 'Retry',
  'retry.hint': 'Click to retry loading',
}
```

Registration (in `src/client/index.ts`):

```ts
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'betterSidebar': BetterSidebarKey
  }
}
// in apply():
ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'better-sidebar: dictionaries')
```

Registering the dock entry with `locale: NS` gives the component the typed `t` seat
(`TranslateNS<'betterSidebar'>`). Tab *names* are NOT part of this namespace - tab labels come from
the tab registry (D4) via `SlotLabel` (a `string | (() => string)` thunk that follows the active
locale), so a third-party tab brings its own label. The dock only consumes each tab descriptor's
label.

---

## 9. Integration: consuming the tab registry

### 9.1 Dependency contract (D4 is the authority)

D7 depends on D4 exposing a service face on `ctx.betterSidebar`. Expected shape (D4 approves):

```ts
export interface BetterSidebarService {
  tabs: ReadonlyMap<TabId, TabDescriptor>
  activeTabId: TabId
  setActiveTab(id: TabId): void
  subscribeActiveTab(fn: (id: TabId) => void): () => void
  dispatchToggle(): void            // keyboard shortcut target
  addTab?(desc: TabDescriptor): () => void   // D4's registration entrypoint
}
export interface TabDescriptor {
  id: TabId
  title: string                       // localized label (thunk when locale-dependent)
  icon: ReactNode                     // inline SVG element (shared/icons or the tab's own)
  component: React.ComponentType<TabContextProps>
}
```

Exposed via `ctx.provide('betterSidebar', svc)` + `declare module '@deepseek-ai/cordis' {
interface Context { betterSidebar: ... } }`, matching the locale plugin pattern (unless D4 requires
`ctx.reflect.provide`, which ui-layout uses).

### 9.2 How the dock subscribes

To keep the dock a **pure component** and the test seam clean (section 10), the dock receives the
registry through props - the plugin inject passes a snapshot plus callbacks:

```tsx
// Plugin-side inject (sketch) producing the dock's business props:
ctx.slots.register({
  name: 'shell.overlay',
  id: 'better-sidebar',
  order: 0,
  locale: NS,
  inject: () => {
    return {
      tabs: [...ctx.betterSidebar.tabs.values()],     // registry snapshot (array)
      activeTabId: ctx.betterSidebar.activeTabId,
      setActiveTab: ctx.betterSidebar.setActiveTab,
      toggle: ctx.betterSidebar.dispatchToggle,
    }
  },
}, RightSidebarDock)
```

- **Default active tab = `'explorer'`** (per brief section 5.8). The registry initializes
  `activeTabId` to `'explorer'`; if no explorer tab is registered (unexpected, since we ship it),
  fall back to the first registered tab, else render an empty panel (section 10). This logic belongs
  to D4 (registry); the dock renders whatever `activeTabId` it's told, but handles the "no tabs at
  all" edge with an empty region.
- Ordering of tabs in `TabBar` follows the registry insertion/order fields (D4 decides). Dock
  renders in registry order.

### 9.3 Active tab change

- `TabBar` calls `setActiveTab(id)`. `TabPanel` re-renders with the new descriptor and remounts
  its component (`key={activeTabId}`).

---

## 10. Shared empty/loading/error surfaces & test seam

### 10.1 Shared components (in `src/client/shared/`)

- **`Spinner`** - inline SVG spinner, `role="status"` + `aria-live="polite"`, no text.
- **`EmptyState({ icon?, title, hint })`** - centered muted block; used for empty explorer/git and
  the no-tabs case. Accepts pre-translated strings.
- **`ErrorState({ title, message, onRetry, retryLabel? })`** - box with error message + Retry button;
  `onRetry` wired by the tab. The tab formats error codes (D5), not this component.

These are dumb presentational components taking translated strings as props, so tests render them
without a locale runtime. Shared so both tab implementations and the dock reuse them.

### 10.2 Test seam (DockFrame receives props, no dsh runtime)

**Decision:** all dock components are **pure** - they take a fully-resolved prop bag and never import
cordis/runtime. Component tests render `DockFrame`/TabBar/TabPanel directly with a hand-built
registry snapshot + fake session/workspace hook results, under jsdom, without mounting the runtime.
Only `RightSidebarDock`'s thin prop derivation touches the framework, covered by a plugin-apply test
using dsh's test runtime (D8).

```tsx
// DockFrameProps - pure geometry shell.
export interface DockFrameProps {
  tabs: readonly TabDescriptor[]          // snapshot
  activeTabId: TabId | null
  onSelectTab(id: TabId): void
  onToggle(): void
  t: TranslateNS<'betterSidebar'>
}

// RightSidebarDockProps - composed (pure derivation).
export type RightSidebarDockProps =
  & DockFrameProps
  & { workspaceRoot?: string | null }      // resolved current-workspace root (handed to tabs)
  & { sessionId?: string }                 // current session id, if any
```

For the "current workspace" root that tabs need: the dock derives a **root path** once per render and
hands it to every tab via `TabContextProps` (this resolves the brief section 4.3 question at the
dock layer - the dock picks the root; D2 consumes it). **Decision:** the root is resolved as: active
session's workspace path if a session is current and has a workspace, else the first workspace from
`useWorkspaces`, else `null`.

```ts
// A tab's context (the component slot contract the dock provides every tab).
export interface TabContextProps {
  rootPath: string | null                 // resolved current-workspace root
  sessionId?: string                      // from session context, if any
  theme: 'light' | 'dark'
  refresh(): void                         // optional reload signal (D2/D3 decide if needed)
}
```

(D2/D3 implement ExplorerTab/GitTab accepting this context; their own authority decides the needed
fields. Keep the dock thin and the tab contract small.)

### 10.3 Component test list (D8 expands)

- **Dock open/collapse**: geometry `open` toggles rail vs expanded; persisted localStorage write on
  toggle; corrupt storage parse falls back to default.
- **Resize**: drag (pointer events) maps to clamped width [240,640]; width change persists; dragging
  left shrinks, right grows; no width below MIN/above MAX.
- **Tab switch**: clicking a tab calls `onSelectTab`; active aria-selected/tabIndex update; panel
  remounts keyed by active id.
- **Empty/error states**: a null activeTabId / no tabs shows EmptyState without crashing; ErrorState
  renders Retry and calls onRetry.
- **Pointer-events/isolation**: collapsed root has width 56 and pointer-events:auto; expanded root does
  NOT render a full-page scrim (assert no full-viewport element). Directly guards the "don't block the
  conversation" requirement.
- **a11y**: roles tablist/tab/tabpanel; roving tabindex; arrow-key moves focus and activates;
  aria-labels come from the t renderer.
- **Theme**: data-bsd-dark toggles when given a fake body[data-ds-dark-theme] (or hook stubbed).

---

## 11. Edge cases & error surfaces

| # | Edge case | Behavior |
| --- | --- | --- |
| 1 | localStorage unavailable / throws | dock stays in-memory; no crash |
| 2 | Corrupt persisted geometry | falls back to default via parseDockGeometry |
| 3 | No tabs registered (registry empty / explorer absent) | dock renders EmptyState panel; still shows empty tablist; never crashes |
| 4 | activeTabId unknown after registry change | TabBar picks first registered tab; if none, EmptyState |
| 5 | Root workspace resolves to null | EmptyState in explorer/git ("No workspace selected"), not an error toast |
| 6 | RPC error in a tab | the tab shows ErrorState with retry (tab re-calls RPC); dock does not intercept |
| 7 | Very narrow viewport (< ~400px) | no auto-collapse in v1 (keep simple); rail reachable via toggle/shortcut. D1 may refine |
| 8 | Drag past MIN/MAX | clamped; no negative/absurd width |
| 9 | pointer leaves window mid-drag | pointer capture keeps the drag; release on pointerup anywhere (AppFrame pattern) |
| 10 | prefers-reduced-motion | transitions/animations disabled |
| 11 | dsh theme attribute flips while dock open | useDark mutation observer updates data-bsd-dark |
| 12 | Multiple overlay entries coexist | our entry is additive (id:'better-sidebar'); no clash with shipped entries |

---

## 12. Decisions summary

- **Decision:** register into `shell.overlay` with `id:'better-sidebar'`, `order:0`, `locale:NS`;
  never into `root`.
- **Decision:** geometry state (open/width) = local React state seeded/persisted to `localStorage`
  (`'betterSidebar.dock:v1'`); not a cordis service, not settings-scope.
- **Decision:** default width 320, clamp [240, 640], rail 56px.
- **Decision:** resize via pointer capture on the left edge (AppFrame DragHandle idiom); direct moves
  (rAF optional).
- **Decision:** no ESC close in v1; documented single toggle shortcut Ctrl/Cmd+Shift+B.
- **Decision:** dock root pointer-events:auto; collapsed root is only the 56px rail so the conversation
  stays clickable. No full-page scrim (not a modal).
- **Decision:** CSS Modules + --bsd-* tokens; dark via body[data-ds-dark-theme] (mutation observer) with
  prefers-color-scheme fallback; color-scheme set per state.
- **Decision:** a11y = role="region" (or complementary) + labeled; ARIA tablist/tab/tabpanel; no focus
  trap; arrows activate tabs; prefers-reduced-motion respected.
- **Decision:** locale namespace betterSidebar, zh source-of-truth + en, registered via
  ctx.locale.register(NS,{zh,en}); tab labels come from the tab registry (D4), not this namespace.
- **Decision:** dock components are pure and receive props (registry snapshot + session/workspace
  hooks) = the test seam; only thin RightSidebarDock derivation touches the framework.
- **Decision:** dock resolves the current-workspace root once per render (active session path -> first
  workspace -> null) and hands it to tabs via TabContextProps.

---

## 13. Open questions

1. **D4 cross-dependency:** exact ctx.betterSidebar interface shape (whether addTab lives on the
   service or registration goes through ctx.slots.register of tab descriptors, and whether it uses
   ctx.provide vs ctx.reflect.provide). This doc assumes a service face; confirm against D4.
2. **Details-column overlap:** whether the right dock should interact with the far-right details
   column's content (D1 decides dock-overlay vs beside; if D1 says "beside/pushes", the section 5
   positioning needs revision).
3. **Auto-collapse on narrow viewport** in v1: this doc says none; D1 may want a breakpoint. Keep the
   state model extensible (a narrow flag can be added without reshuffling).
4. **refresh channel in TabContextProps:** whether a cross-tab refresh signal is needed in v1, or if
   each tab owns its refresh. Currently optional/deferred.
5. **Rail icon source:** confirm the tab registry supplies the icon ReactNode (D4), so the dock never
   hardcodes a tab's icon.
6. **Focus behavior granularity** on tab switch (panel root vs first focusable element): pick panel-root
   focus for v1, revisit in practice.
