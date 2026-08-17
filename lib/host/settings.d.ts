/**
 * Host-side settings namespace registration (ADR-004 §3 amendment, user
 * settings). Registers the plugin's user-editable section — auto-refresh
 * cadences and the git timeout — against the dsh settings seam so a browser
 * (Settings > Plugins > Plugin configuration) can read and edit them live.
 *
 * Since dsh v0.1.0-rc.7 ("Enable plugins to register their own settings
 * cards"), the Host serves every registered settings namespace: `settings
 * .describe` on the api-proxy returns the whole registration catalog and the
 * Plugins configuration tab dispatches one card per served namespace it also
 * has a browser-side registration for. So registering the namespace here is
 * the complete host half — no allowlist edit and no `registerConfigurable
 * Providers` self-exposure are needed anymore (that was the pre-rc.7 seam,
 * which also cost a read-only Models-page card and is now gone).
 *
 * Registration is guarded: it only runs when the `settings` seam is composed.
 * Absence is not fatal — the plugin still works with the contract defaults.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type BetterSidebarSettings } from '../contract/index.ts';
export declare const BETTER_SIDEBAR_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Schemastery schema for the plugin's user-editable section. */
export declare const BetterSidebarSettingsSchema: z<BetterSidebarSettings>;
/**
 * Register the plugin settings section when the settings seam is composed.
 * @param ctx - host context that may acquire the `settings` service.
 */
export declare function registerBetterSidebarSettings(ctx: Context): void;
//# sourceMappingURL=settings.d.ts.map