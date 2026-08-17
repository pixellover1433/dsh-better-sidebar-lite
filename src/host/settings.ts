/**
 * Host-side settings namespace registration (ADR-004 §3 amendment, user
 * settings). Registers the plugin's user-editable section — auto-refresh
 * cadences and the git timeout — against the dsh settings seam so a browser
 * (Settings > Plugins > Plugin configuration) can read and edit them live.
 *
 * The register call is guarded: it only runs when a SettingsProvider is
 * composed in the deployment. Absence is not fatal — the plugin still works
 * with the contract defaults, exactly as it does today (the tab auto-refresh
 * keeps its fallback cadence and the git timeout its default). Registration is
 * itself an effect on the injected settings-context's fiber, so unloading the
 * owner plugin removes the namespace and its observers (HMR-safe).
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import {
  SETTINGS_DEFAULTS,
  SETTINGS_NAMESPACE,
  type BetterSidebarSettings,
} from '../contract/index.ts'

export const BETTER_SIDEBAR_NAMESPACE = settingsNamespace(SETTINGS_NAMESPACE)

/** Schemastery schema for the plugin's user-editable section. */
export const BetterSidebarSettingsSchema: z<BetterSidebarSettings> = z.object({
  explorerPollMs: z.natural().min(1_000).max(300_000).default(SETTINGS_DEFAULTS.explorerPollMs),
  explorerDebounceMs: z.natural().min(100).max(60_000).default(SETTINGS_DEFAULTS.explorerDebounceMs),
  gitPollMs: z.natural().min(1_000).max(300_000).default(SETTINGS_DEFAULTS.gitPollMs),
  gitDebounceMs: z.natural().min(100).max(60_000).default(SETTINGS_DEFAULTS.gitDebounceMs),
  gitTimeoutMs: z.natural().min(100).max(120_000).default(SETTINGS_DEFAULTS.gitTimeoutMs),
})

/**
 * Register the plugin settings section when the settings seam is composed.
 * @param ctx - host context that may acquire the `settings` service.
 */
export function registerBetterSidebarSettings(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(BETTER_SIDEBAR_NAMESPACE, BetterSidebarSettingsSchema)
  })
}
