import z from '@deepseek-ai/schemastery';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { SETTINGS_DEFAULTS, SETTING_RANGES, SETTINGS_NAMESPACE, } from "../contract/index.js";
export const BETTER_SIDEBAR_NAMESPACE = settingsNamespace(SETTINGS_NAMESPACE);
/** One natural-number field built from the shared range constants. */
function naturalField(field) {
    const { min, max } = SETTING_RANGES[field];
    return z.natural().min(min).max(max).default(SETTINGS_DEFAULTS[field]);
}
/** Schemastery schema for the plugin's user-editable section. */
export const BetterSidebarSettingsSchema = z.object({
    explorerPollMs: naturalField('explorerPollMs'),
    explorerDebounceMs: naturalField('explorerDebounceMs'),
    gitPollMs: naturalField('gitPollMs'),
    gitDebounceMs: naturalField('gitDebounceMs'),
    gitTimeoutMs: naturalField('gitTimeoutMs'),
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
//# sourceMappingURL=settings.js.map