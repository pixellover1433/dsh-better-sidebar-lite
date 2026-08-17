/**
 * Host-side settings namespace registration (ADR-004 §3 amendment, user
 * settings). Registers the plugin's user-editable section — auto-refresh
 * cadences and the git timeout — against the dsh settings seam so a browser
 * (Settings > Plugins > Plugin configuration) can read and edit them live.
 *
 * dsh exposes a plugin's settings namespace to the browser only through an
 * allowlist in `api-proxy` (`WEB_SETTINGS_NAMESPACES`); a namespace absent
 * there answers `settings-not-exposed` even when its owner registered it. To
 * let a plugin's namespace show up without a change inside the dsh checkout,
 * the plugin ALSO registers itself as a configurable provider in the LLM
 * directory — `api-proxy.exposedNamespaces()` includes every
 * `listConfigurableProviders()` `settingsNs` — which self-exposes the
 * namespace at runtime. This is the one existing self-registration seam; its
 * minor cost is a single read-only "provider" card on the Settings > Models
 * page (it carries no adapter route, so it never reaches the model picker).
 *
 * Both register calls are guarded: they only run when the corresponding seams
 * (`settings`, `llm`) are composed. Absence is not fatal — the plugin still
 * works with the contract defaults.
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
/** Display name used for the self-exposure "provider" card on the Models page. */
export declare const BETTER_SIDEBAR_PROVIDER = "dsh-better-sidebar-lite";
export declare const BETTER_SIDEBAR_PROVIDER_NAME = "Better Sidebar";
/**
 * Self-expose the settings namespace to the browser configuration client by
 * registering this plugin as a configurable provider (see the module doc).
 * Registration is an effect on the injected llm-context's fiber, so unloading
 * withdraws it (HMR-safe). No-op when the `llm` seam is absent.
 * @param ctx - host context that may acquire the `llm` service.
 */
export declare function selfExposeBetterSidebarSettings(ctx: Context): void;
//# sourceMappingURL=settings.d.ts.map