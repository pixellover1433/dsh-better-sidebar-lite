/**
 * DockRoot: the frame's right 'details' column occupant (ADR-001/003).
 * AppFrame owns the column track — the grid reserves space beside the
 * conversation (no overlay, no overlap), its drag handle resizes the dock,
 * and the border comes with the column. The dock drives open/close via
 * ctx.layout (openDetails/closeDetails), and the column keeps this subtree
 * mounted at 0 width while closed, so tab state survives collapse.
 *
 * Column fallback: the details track only opens for a current NON-blank
 * session on a wide-enough viewport (AppFrame gates both). When it is closed
 * while the dock is OPEN, the dock renders absolute at the right edge
 * instead of disappearing — the sidebar stays available, and docks back
 * in-flow the moment the column opens. Collapse renders nothing (zero
 * overlap); a toggle button in the LEFT sidebar footer (footer-toggle.tsx)
 * plus Ctrl/Cmd+Shift+B restore it.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { SnapshotSelectorHook, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionListState, WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { BetterSidebarRpc } from '../rpc-client.ts'
import type { BetterSidebarTabRegistry, TabDef, TabID } from '../tab-registry/contract.ts'
import { DockContext } from './context.ts'
import type { DockContextValue } from './context.ts'
import { TabList, tabButtonId, tabPanelId } from '../tabbar/tablist.tsx'
import type { TabListTab } from '../tabbar/tablist.tsx'
import { TabPanel } from '../tabbar/tabpanel.tsx'
import { CollapseIcon } from '../icons.tsx'
import css from './dock.module.css'

/** Window event the plugin's global shortcut dispatches to flip the dock. */
export const TOGGLE_EVENT = 'better-sidebar:toggle'

/** The layout face subset the dock drives (open/close the details column). */
export interface DockLayoutActions {
  openDetails(): void
  closeDetails(): void
}

/** Persisted open/closed preference key (the column width lives in the layout store). */
export const DOCK_STORAGE_KEY = 'dsh.betterSidebar.dock'

export interface DockRootProps {
  useSessions: SnapshotSelectorHook<SessionListState>
  useWorkspaces: SnapshotSelectorHook<WorkspaceListState>
  rpc: BetterSidebarRpc
  tabs: BetterSidebarTabRegistry
  /** Localized shell copy (plugin passes ctx.locale.bind(NS)). */
  t: TranslateNS<'betterSidebar.dock'>
  /** Details-column panel actions (open/close the sidebar). */
  layout: DockLayoutActions
}

interface DockSnapshot {
  ids: readonly TabID[]
  active: TabID | undefined
}

/** Bridge the registry to React with a referentially stable snapshot. */
function useTabs(tabs: BetterSidebarTabRegistry): DockSnapshot {
  const cached = useRef<DockSnapshot | undefined>(undefined)
  const getSnapshot = useCallback((): DockSnapshot => {
    const ids = tabs.ids()
    const active = tabs.active
    const prev = cached.current
    if (prev !== undefined && prev.active === active && prev.ids.length === ids.length && ids.every((id, i) => prev.ids[i] === id)) {
      return prev
    }
    const next: DockSnapshot = Object.freeze({ ids, active })
    cached.current = next
    return next
  }, [tabs])
  // Arrow wrappers bind `this` (class methods are unbound; React calls subscribe bare).
  return useSyncExternalStore((fn) => tabs.subscribe(fn), getSnapshot)
}

/** Read the persisted open/closed preference; anything malformed or absent defaults to open. */
function readInitialOpen(): boolean {
  if (typeof localStorage === 'undefined') return true
  try {
    const raw = localStorage.getItem(DOCK_STORAGE_KEY)
    if (raw === null) return true
    const parsed = JSON.parse(raw) as { open?: unknown }
    return parsed.open !== false
  } catch {
    return true
  }
}

/** Persist the open/closed preference (best effort; quota/denied keeps in-memory only). */
function persistOpen(open: boolean): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify({ open }))
  } catch {
    // quota/denied: keep in-memory only
  }
}

export function DockRoot({ useSessions, useWorkspaces, rpc, tabs, t, layout }: DockRootProps): JSX.Element {
  const snapshot = useTabs(tabs)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Whether the details column track has real width. AppFrame gates it on a
  // current non-blank session and a wide-enough viewport; the dock observes
  // its own column (the parent of the outlet anchor) so ANY reason the column
  // is closed falls back to the floating dock instead of vanishing.
  const [columnOpen, setColumnOpen] = useState(true)
  useEffect(() => {
    const el = rootRef.current?.parentElement?.parentElement
    if (el === undefined || el === null || typeof ResizeObserver === 'undefined') return
    const read = (): void => { setColumnOpen(el.getBoundingClientRect().width > 0) }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Open/closed mirror of the details column. The layout store is the real
  // source of truth (AppFrame owns the track and auto-closes it on narrow
  // viewports), but its face exposes no read, so the dock tracks the
  // direction it last wrote. `open` drives rendering (full dock / floating /
  // rail); openRef keeps the toggle listener on the latest value. A persisted
  // "closed" now renders the RAIL — the sidebar never disappears entirely.
  const [open, setOpen] = useState(true)
  const openRef = useRef<boolean>(true)
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    const initial = readInitialOpen()
    openRef.current = initial
    setOpen(initial)
    persistOpen(initial)
    if (initial) layout.openDetails()
  }, [layout])

  const applyOpen = useCallback((next: boolean): void => {
    openRef.current = next
    setOpen(next)
    persistOpen(next)
    if (next) { layout.openDetails() } else { layout.closeDetails() }
  }, [layout])

  useEffect(() => {
    const onToggle = (): void => { applyOpen(!openRef.current) }
    window.addEventListener(TOGGLE_EVENT, onToggle)
    return () => window.removeEventListener(TOGGLE_EVENT, onToggle)
  }, [applyOpen])

  const defs = snapshot.ids
    .map(id => tabs.get(id))
    .filter((def): def is TabDef => def !== undefined)
  const labelOf = (def: TabDef): string => (typeof def.label === 'function' ? def.label() : def.label)
  const listTabs: TabListTab[] = defs.map(def => ({ id: def.id, label: labelOf(def), icon: def.icon }))
  const active = snapshot.active
  const activeDef = active === undefined ? undefined : tabs.get(active)

  const contextValue: DockContextValue = { rpc, useSessions, useWorkspaces }

  const floating = open && !columnOpen
  return (
    <DockContext.Provider value={contextValue}>
      {open ? (
        <div
          ref={rootRef}
          className={floating ? css.rootFloating : css.root}
          data-floating={floating || undefined}
          data-open
          role="region"
          aria-label={t('dock.title')}
        >
          <DockBody
            onCollapse={() => applyOpen(false)}
            tabs={listTabs}
            activeId={active}
            onSelect={(id) => { tabs.select(id) }}
            t={t}
            activePanel={activeDef?.renderPanel() ?? null}
          />
        </div>
      ) : null}
    </DockContext.Provider>
  )
}

/** The dock body: header + tab bar + active panel (fills the details column). */
function DockBody({
  onCollapse, tabs, activeId, onSelect, t, activePanel,
}: {
  onCollapse(): void
  tabs: readonly TabListTab[]
  activeId: TabID | undefined
  onSelect(id: TabID): void
  t: TranslateNS<'betterSidebar.dock'>
  activePanel: ReactNode | null
}): JSX.Element {
  const active = tabs.find(tab => tab.id === activeId)

  return (
    <>
      <div className={css.header}>
        <span className={css.title}>{t('dock.title')}</span>
        <button type="button" className={css.iconButton} aria-label={t('toggle.collapse')} title={t('toggle.collapse')} onClick={onCollapse}>
          <CollapseIcon size={16} />
        </button>
      </div>
      <TabList
        tabs={tabs}
        activeId={activeId}
        onSelect={id => onSelect(id as TabID)}
        label={t('tablist.label')}
      />
      <div className={css.body}>
        <TabPanel id={active ? tabPanelId(active.id) : ''} labelledBy={active ? tabButtonId(active.id) : ''}>
          {activePanel === null ? <span className={css.empty}>{t('empty.title')}</span> : activePanel}
        </TabPanel>
      </div>
    </>
  )
}

/** The details-column entry component (ADR-001): a closure over the injected
 * services that forwards the framework's global props to DockRoot. Lives here
 * (a .tsx module) so the .ts plugin entry never embeds JSX.
 */
export function createDockEntry(services: {
  rpc: BetterSidebarRpc
  tabs: BetterSidebarTabRegistry
  t: TranslateNS<'betterSidebar.dock'>
  layout: DockLayoutActions
}): (props: DockRootPropsWithoutServices) => JSX.Element {
  const DockEntry = (props: DockRootPropsWithoutServices): JSX.Element => (
    <DockRoot
      useSessions={props.useSessions}
      useWorkspaces={props.useWorkspaces}
      rpc={services.rpc}
      tabs={services.tabs}
      t={services.t}
      layout={services.layout}
    />
  )
  return DockEntry
}

/** The global-only slice of DockRoot props the slot framework supplies. */
export interface DockRootPropsWithoutServices {
  useSessions: DockRootProps['useSessions']
  useWorkspaces: DockRootProps['useWorkspaces']
}