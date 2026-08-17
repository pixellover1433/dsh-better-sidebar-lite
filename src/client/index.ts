/**
 * Client plugin entry (client-core): contributes the right-docked sidebar as
 * the frame's 'details' column occupant, provides ctx.betterSidebar,
 * registers the dock + built-in tab locales, wires the built-in explorer/git
 * tabs onto the tab registry, and binds the Ctrl/Cmd+Shift+B toggle.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Merges the ui-layout SlotMap declaration so 'details' is a valid slot key.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Merges the ui-settings Context merge so `ctx.settingsScope` is typed (present
// when ui-settings is composed; absent otherwise).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import { SETTINGS_NAMESPACE, type BetterSidebarSettings } from '../contract/settings.ts'
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
import { registerBetterSidebarCard, NS as CARD_PLUGINS_NS } from './settings-card/register.ts'
import { en as cardPluginsEn, zh as cardPluginsZh } from './settings-card/locales.ts'
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

/** Required services. `settingsScope` is optional (present when ui-settings is
 * composed); when absent the tabs keep their built-in defaults and no card is
 * registered into Settings > Plugins. */
export const inject = ['connection', 'slots', 'locale', 'layout', 'settingsScope']

/**
 * Client plugin body: provide ctx.betterSidebar, register shell + built-in
 * locales, register the built-in tabs, register the dock into the frame's
 * 'details' column, and bind the global toggle shortcut. Every registration
 * is disposed (LIFO)
 * on fiber teardown for HMR safety.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // The authoritative way a service lands on ctx is the bundle-exported
  // `inject` array below (what Cordis' fiber resolves and provides on ctx).
  // `dsh.client.inject` in package.json is informational graph metadata only —
  // it does NOT wire the fiber. If `inject` above ever drops 'layout',
  // ctx.layout is undefined and the dock would crash silently (entry
  // abdicates, column falls back to the native DetailsPanel) — fail loud at
  // boot instead.
  if (ctx.layout === undefined) {
    throw new Error('better-sidebar: ctx.layout missing — add "layout" to the bundle-exported inject list in src/client/index.ts')
  }
  ctx.effect(() => {
    const rpc = createBetterSidebarRpc(ctx.connection)
    const tabs = new TabRegistryService()
    const explorer = new ExplorerOpenFileEmitter()

    // Bind the plugin settings namespace when the settings service is composed
    // (absent => undefined, and no card is registered into Settings > Plugins).
    // The decode narrows the wire section to the typed settings (the host schema
    // already resolved defaults, so a plain passthrough suffices).
    const scope = ctx.settingsScope?.bind<BetterSidebarSettings>?.({
      namespace: SETTINGS_NAMESPACE,
      decode: (section) => section as BetterSidebarSettings | undefined,
    })

    const disposeProvide = ctx.reflect.provide('betterSidebar', { rpc, tabs, explorer })
    const disposeShellLocale = ctx.locale.register(DOCK_NS, { zh: dockZh, en: dockEn })
    const disposeExplorerLocale = ctx.locale.register(EXPLORER_NS, { zh: explorerZh, en: explorerEn })
    const disposeGitLocale = ctx.locale.register(GIT_NS, { zh: gitZh, en: gitEn })
    // Locale for this plugin's settings card (Settings > Plugins). Registered
    // even when the settings seam is absent — the namespaced card reads it only
    // if it mounts, and a duplicate namespace would throw.
    const disposeCardLocale = ctx.locale.register(CARD_PLUGINS_NS, { zh: cardPluginsZh, en: cardPluginsEn })

    const disposeGitTab = tabs.register(createGitTabDef(ctx, { rpc }))
    const disposeExplorerTab = tabs.register(createExplorerTabDef(ctx, { rpc, emitter: explorer }))

    const DockEntry = createDockEntry({ rpc, tabs, settings: scope, t: ctx.locale.bind(DOCK_NS), layout: ctx.layout })
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

    // When the settings seam is composed, contribute our card to the
    // Settings > Plugins > Plugin configuration section so the user can edit
    // the tab tunables live (ADR-004 §3 amendment).
    const disposeCard = scope === undefined
      ? undefined
      : registerBetterSidebarCard(ctx, { scope })

    return () => {
      disposeCard?.()
      disposeShortcut()
      disposeFooterToggle()
      disposeDockEntry()
      disposeExplorerTab()
      disposeGitTab()
      disposeGitLocale()
      disposeExplorerLocale()
      disposeShellLocale()
      disposeCardLocale()
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