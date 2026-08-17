import { SETTINGS_NAMESPACE } from "../contract/settings.js";
import { createBetterSidebarRpc } from "./rpc-client.js";
import { TabRegistryService } from "./tab-registry/service.js";
import { ExplorerOpenFileEmitter } from "./tabs/explorer/events.js";
import { createDockEntry, TOGGLE_EVENT } from "./dock/dock.js";
import { createSidebarToggleAction } from "./dock/footer-toggle.js";
import { createExplorerTabDef } from "./tabs/explorer/tab-def.js";
import { createGitTabDef } from "./tabs/git/tab-def.js";
import { registerBetterSidebarCard } from "./settings-card/register.js";
import { en as dockEn, NS as DOCK_NS, zh as dockZh } from "./locales.js";
import { en as explorerEn, NS as EXPLORER_NS, zh as explorerZh } from "./tabs/explorer/locales.js";
import { en as gitEn, NS as GIT_NS, zh as gitZh } from "./tabs/git/locales.js";
/** Required services. `settingsScope` is optional (present when ui-settings is
 * composed); when absent the tabs keep their built-in defaults and no card is
 * registered into Settings > Plugins. */
export const inject = ['connection', 'slots', 'locale', 'layout', 'settingsScope'];
/**
 * Client plugin body: provide ctx.betterSidebar, register shell + built-in
 * locales, register the built-in tabs, register the dock into the frame's
 * 'details' column, and bind the global toggle shortcut. Every registration
 * is disposed (LIFO)
 * on fiber teardown for HMR safety.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    // The boot manifest's dsh.client.inject list (package.json), not the bundle
    // export, is what wires the fiber's ctx. If it ever drifts from the inject
    // list above, ctx.layout is undefined and the dock would crash silently
    // (entry abdicates, column falls back to the native DetailsPanel) — fail
    // loud at boot instead.
    if (ctx.layout === undefined) {
        throw new Error('better-sidebar: ctx.layout missing — add "layout" to dsh.client.inject in package.json');
    }
    ctx.effect(() => {
        const rpc = createBetterSidebarRpc(ctx.connection);
        const tabs = new TabRegistryService();
        const explorer = new ExplorerOpenFileEmitter();
        // Bind the plugin settings namespace when the settings service is composed
        // (absent => undefined, and no card is registered into Settings > Plugins).
        // The decode narrows the wire section to the typed settings (the host schema
        // already resolved defaults, so a plain passthrough suffices).
        const scope = (ctx.settingsScope?.bind)?.({
            namespace: SETTINGS_NAMESPACE,
            decode: (section) => section,
        });
        const disposeProvide = ctx.reflect.provide('betterSidebar', { rpc, tabs, explorer });
        const disposeShellLocale = ctx.locale.register(DOCK_NS, { zh: dockZh, en: dockEn });
        const disposeExplorerLocale = ctx.locale.register(EXPLORER_NS, { zh: explorerZh, en: explorerEn });
        const disposeGitLocale = ctx.locale.register(GIT_NS, { zh: gitZh, en: gitEn });
        const disposeGitTab = tabs.register(createGitTabDef(ctx, { rpc }));
        const disposeExplorerTab = tabs.register(createExplorerTabDef(ctx, { rpc, emitter: explorer }));
        const DockEntry = createDockEntry({ rpc, tabs, settings: scope, t: ctx.locale.bind(DOCK_NS), layout: ctx.layout });
        // The dock owns the frame's right 'details' column (declared by ui-layout
        // AppFrame). Priority -1 shadows ui-conversation's DetailsPanel — the
        // sanctioned way to take over a single seat — and inject, not bare
        // register, rides the declaration lifetime (re-registers after a
        // declaring slot is restored — the ui-jobs pattern).
        const disposeDockEntry = ctx.slots.inject('details', () => ctx.slots.register({
            name: 'details',
            priority: -1,
        }, DockEntry));
        // The collapsed dock renders nothing (the details column cannot reserve a
        // rail width); a toggle button in the LEFT sidebar footer restores it
        // without ever overlapping content. Declared by ui-sidebar, so the entry
        // rides the declaration lifetime like the dock itself.
        const FooterToggle = createSidebarToggleAction(ctx.locale.bind(DOCK_NS));
        const disposeFooterToggle = ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
            name: 'sidebar.footer.action',
            id: 'better-sidebar-toggle',
            order: 10,
        }, FooterToggle));
        const disposeShortcut = bindToggleShortcut();
        // When the settings seam is composed, contribute our card to the
        // Settings > Plugins > Plugin configuration section so the user can edit
        // the tab tunables live (ADR-004 §3 amendment).
        const disposeCard = scope === undefined
            ? undefined
            : registerBetterSidebarCard(ctx, { scope });
        return () => {
            disposeCard?.();
            disposeShortcut();
            disposeFooterToggle();
            disposeDockEntry();
            disposeExplorerTab();
            disposeGitTab();
            disposeGitLocale();
            disposeExplorerLocale();
            disposeShellLocale();
            // provide()'s disposer settles asynchronously; teardown is fire-and-forget.
            void disposeProvide();
        };
    }, 'better-sidebar: service + dock');
}
/** Ctrl/Cmd+Shift+B toggles the dock by dispatching its window event. */
function bindToggleShortcut() {
    const onKey = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyB') {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent(TOGGLE_EVENT));
        }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
}
//# sourceMappingURL=index.js.map