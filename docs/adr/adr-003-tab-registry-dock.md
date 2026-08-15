# ADR-003 — Tab registry & dock

Status: accepted · Source designs: D4 (registry), D7 (UI), D1 §4-5 · Supersedes D4's shortcut/scope options (deferred)

## Decisions

1. **Registry API** (client, `ctx.betterSidebar.tabs`):
   ```ts
   export interface TabDef {
     id: string                          // stable unique id
     order?: number                      // lower sorts first; default 1000
     label: string | (() => string)      // locale-aware via function
     icon: React.ReactNode               // inline SVG element (icons.tsx)
     badge?: () => number | string | undefined
     renderPanel: () => React.ReactNode  // active-tab content
   }
   export interface BetterSidebarTabRegistry {
     register(def: TabDef): () => void   // throws TabRegisterError on duplicate id
     unregister(id: string): void
     active: string | undefined
     select(id: string): boolean
     ids(): readonly string[]            // ordered: (order, registration index)
     get(id: string): TabDef | undefined
     subscribe(fn: () => void): () => void
   }
   ```
   Deferred (documented, not built): per-tab `shortcut`, `scope`, locale-keyed `{ns,key}` titles, badge click actions.
2. **Active-tab persistence:** single localStorage key `dsh.betterSidebar.activeTab`; corrupt/stale values fall back to the first remaining tab; when the active tab is unregistered, fall back the same way.
3. **Dock column (supersedes the overlay panel):** the dock occupies the frame's right `details` column (ADR-001 §2-3) — AppFrame owns the track, the drag handle (clamp [300, 520], default 360), the border, and narrow-viewport concession; the dock fills the column and drives only open/close via `ctx.layout`. Open/closed preference persists to localStorage `dsh.betterSidebar.dock` (read at mount; the column width lives in the layout store and is not persisted). When the column is closed for any reason (blank session, narrow viewport, collapsed) the dock renders absolute at the right edge — a 320px floating panel while open-with-no-column, a 56px tab rail while collapsed — and docks back in-flow once the column opens.
4. **A11y:** dock root `role="region"` + aria-label; `role=tablist/tab/tabpanel` with roving tabindex and arrow-key activation; no focus trap; prefers-reduced-motion honored.
5. **Styles:** CSS modules + `--bsd-*` tokens in `styles.css` (color-scheme + prefers-color-scheme dark default; also reacts to `body[data-ds-dark-theme]` via MutationObserver). Icons: own tiny inline-SVG set (`src/client/icons.tsx`).
6. **Locales:** namespace `betterSidebar`, en + zh dictionaries, dsh `ctx.locale.register` pattern + LocaleNamespaceMap merge.
7. **Tab panel props:** `TabPanelProps = { tabId }` only (test seam — tabs read session/workspace via the registry-provided hooks or props injected by the tab factory).