import z from '@deepseek-ai/schemastery';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { SETTINGS_DEFAULTS, SETTINGS_NAMESPACE, } from "../contract/index.js";
export const BETTER_SIDEBAR_NAMESPACE = settingsNamespace(SETTINGS_NAMESPACE);
/** Schemastery schema for the plugin's user-editable section. */
export const BetterSidebarSettingsSchema = z.object({
    explorerPollMs: z.natural().min(1_000).max(300_000).default(SETTINGS_DEFAULTS.explorerPollMs),
    explorerDebounceMs: z.natural().min(100).max(60_000).default(SETTINGS_DEFAULTS.explorerDebounceMs),
    gitPollMs: z.natural().min(1_000).max(300_000).default(SETTINGS_DEFAULTS.gitPollMs),
    gitDebounceMs: z.natural().min(100).max(60_000).default(SETTINGS_DEFAULTS.gitDebounceMs),
    gitTimeoutMs: z.natural().min(100).max(120_000).default(SETTINGS_DEFAULTS.gitTimeoutMs),
});
/**
 * Register the plugin settings section when the settings seam is composed.
 * @param ctx - host context that may acquire the `settings` service.
 */
export function registerBetterSidebarSettings(ctx) {
    ctx.inject(['settings'], (settingsCtx) => {
        settingsCtx.settings.register(BETTER_SIDEBAR_NAMESPACE, BetterSidebarSettingsSchema);
    });
}
/** Display name used for the self-exposure "provider" card on the Models page. */
export const BETTER_SIDEBAR_PROVIDER = 'dsh-better-sidebar-lite';
export const BETTER_SIDEBAR_PROVIDER_NAME = 'Better Sidebar';
/**
 * Self-expose the settings namespace to the browser configuration client by
 * registering this plugin as a configurable provider (see the module doc).
 * Registration is an effect on the injected llm-context's fiber, so unloading
 * withdraws it (HMR-safe). No-op when the `llm` seam is absent.
 * @param ctx - host context that may acquire the `llm` service.
 */
export function selfExposeBetterSidebarSettings(ctx) {
    ctx.inject(['llm'], (llmCtx) => {
        llmCtx.effect(() => {
            const handle = llmCtx.llm.registerConfigurableProviders([{
                    provider: BETTER_SIDEBAR_PROVIDER,
                    displayName: BETTER_SIDEBAR_PROVIDER_NAME,
                    settingsNs: SETTINGS_NAMESPACE,
                    settingsPath: [],
                }]);
            return handle;
        }, 'better-sidebar: self-expose settings namespace');
    });
}
//# sourceMappingURL=settings.js.map