/**
 * Locale copy for this plugin's settings card. The card renders inside the
 * Settings > Plugins > Plugin configuration section and mirrors the shipped
 * shell/agent-loop/web-search cards: it uses the same verbatim strings the
 * harness publishes for shared card chrome (save/discard/overridden/reset/...),
 * plus keys specific to this plugin's tunables. Hosted under its own namespace
 * because `settings.plugins` is owned by ui-settings-plugins.
 */
export declare const NS: "betterSidebar.plugins";
/** Locale keys the settings card renders. */
export type BetterSidebarPluginsLocaleKey = 'cardTitle' | 'cardDescription' | 'overridden' | 'reset' | 'readOnly' | 'expand' | 'collapse' | 'save' | 'saving' | 'discard' | 'unsaved' | 'saveFailed' | 'invalidNumber' | 'invalidRange' | 'explorerPollMs' | 'explorerPollMsHint' | 'explorerDebounceMs' | 'explorerDebounceMsHint' | 'gitPollMs' | 'gitPollMsHint' | 'gitDebounceMs' | 'gitDebounceMsHint' | 'skillsPollMs' | 'skillsPollMsHint';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** This plugin's settings-card namespace (Settings > Plugins). */
        'betterSidebar.plugins': BetterSidebarPluginsLocaleKey;
    }
}
/** English copy (card-chrome strings mirror ui-settings-plugins verbatim). */
export declare const en: Record<BetterSidebarPluginsLocaleKey, string>;
/** Simplified Chinese copy. */
export declare const zh: Record<BetterSidebarPluginsLocaleKey, string>;
//# sourceMappingURL=locales.d.ts.map