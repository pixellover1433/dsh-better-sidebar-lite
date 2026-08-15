/**
 * Client plugin entry (client-core): contributes the right-docked sidebar as
 * the frame's 'details' column occupant, provides ctx.betterSidebar,
 * registers the dock + built-in tab locales, wires the built-in explorer/git
 * tabs onto the tab registry, and binds the Ctrl/Cmd+Shift+B toggle.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Merges the ui-layout SlotMap declaration so 'details' is a valid slot key.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { createBetterSidebarRpc } from './rpc-client.ts'
import type { BetterSidebarRpc } from './rpc-client.ts'
import { TabRegistryService } from './tab-registry/service.ts'
import type { BetterSidebarTabRegistry as TabRegistryFace } from './tab-registry/contract.ts'
import { ExplorerOpenFileEmitter } from './tabs/explorer/events.ts'
import type { ExplorerEvents } from './tabs/explorer/events.ts'
import { createDockEntry, TOGGLE_EVENT } from './dock/dock.tsx'
import { createSidebarToggleAction } from './dock/footer-toggle.tsx'
import { createExplorerTabDef } from './tabs/explorer/tab-def.ts'
import { createGitTabDef } from './tabs/git/tab-def.ts'
import { en as dockEn, NS as DOCK_NS, zh as dockZh } from './locales.ts'
import { en as explorerEn, NS as EXPLORER_NS, zh as explorerZh } from './tabs/explorer/locales.ts'
import { en as gitEn, NS as GIT_NS, zh as gitZh } from './tabs/git/locales.ts'

/** Cross-plugin service face (ADR-001). */
export interface BetterSidebarService {
  rpc: BetterSidebarRpc
  tabs: TabRegistryFace
  explorer: ExplorerEvents
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Right-column sidebar facade: RPC + tab registry + open-file events. */
    betterSidebar: BetterSidebarService
    /** Generic logical RPC channel handle (client half provides this at runtime). */
    connection: ConnectionHandle
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * Mirror of ui-sidebar's declaration (that package is not installed in
     * this workspace): optional actions beside Settings at the sidebar foot.
     * Kind/scope/owner match ui-sidebar's contract/slots.ts verbatim.
     */
    'sidebar.footer.action': { kind: 'list'; scope: 'root'; owner: { wide: boolean } }
  }
}

/** Required services. */
export const inject = ['connection', 'slots', 'locale', 'layout']

/**
 * Client plugin body: provide ctx.betterSidebar, register shell + built-in
 * locales, register the built-in tabs, register the dock into the frame's
 * 'details' column, and bind the global toggle shortcut. Every registration
 * is disposed (LIFO)
 * on fiber teardown for HMR safety.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // The boot manifest's dsh.client.inject list (package.json), not the bundle
  // export, is what wires the fiber's ctx. If it ever drifts from the inject
  // list above, ctx.layout is undefined and the dock would crash silently
  // (entry abdicates, column falls back to the native DetailsPanel) — fail
  // loud at boot instead.
  if (ctx.layout === undefined) {
    throw new Error('better-sidebar: ctx.layout missing — add "layout" to dsh.client.inject in package.json')
  }
  ctx.effect(() => {
    const rpc = createBetterSidebarRpc(ctx.connection)
    const tabs = new TabRegistryService()
    const explorer = new ExplorerOpenFileEmitter()

    const disposeProvide = ctx.reflect.provide('betterSidebar', { rpc, tabs, explorer })
    const disposeShellLocale = ctx.locale.register(DOCK_NS, { zh: dockZh, en: dockEn })
    const disposeExplorerLocale = ctx.locale.register(EXPLORER_NS, { zh: explorerZh, en: explorerEn })
    const disposeGitLocale = ctx.locale.register(GIT_NS, { zh: gitZh, en: gitEn })

    const disposeGitTab = tabs.register(createGitTabDef(ctx, { rpc }))
    const disposeExplorerTab = tabs.register(createExplorerTabDef(ctx, { rpc, emitter: explorer }))

    const DockEntry = createDockEntry({ rpc, tabs, t: ctx.locale.bind(DOCK_NS), layout: ctx.layout })
    // The dock owns the frame's right 'details' column (declared by ui-layout
    // AppFrame). Priority -1 shadows ui-conversation's DetailsPanel — the
    // sanctioned way to take over a single seat — and inject, not bare
    // register, rides the declaration lifetime (re-registers after a
    // declaring slot is restored — the ui-jobs pattern).
    const disposeDockEntry = ctx.slots.inject('details', () => ctx.slots.register({
      name: 'details',
      priority: -1,
    }, DockEntry))
    // The collapsed dock renders nothing (the details column cannot reserve a
    // rail width); a toggle button in the LEFT sidebar footer restores it
    // without ever overlapping content. Declared by ui-sidebar, so the entry
    // rides the declaration lifetime like the dock itself.
    const FooterToggle = createSidebarToggleAction(ctx.locale.bind(DOCK_NS))
    const disposeFooterToggle = ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
      name: 'sidebar.footer.action',
      id: 'better-sidebar-toggle',
      order: 10,
    }, FooterToggle))
    const disposeShortcut = bindToggleShortcut()

    return () => {
      disposeShortcut()
      disposeFooterToggle()
      disposeDockEntry()
      disposeExplorerTab()
      disposeGitTab()
      disposeGitLocale()
      disposeExplorerLocale()
      disposeShellLocale()
      // provide()'s disposer settles asynchronously; teardown is fire-and-forget.
      void disposeProvide()
    }
  }, 'better-sidebar: service + dock')
}

/** Ctrl/Cmd+Shift+B toggles the dock by dispatching its window event. */
function bindToggleShortcut(): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyB') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent(TOGGLE_EVENT))
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}