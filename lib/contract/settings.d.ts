/**
 * Plugin settings namespace (ADR-004 §3 amendment, configurable via
 * Settings > Plugins > Plugin configuration). This is the plugin-owned,
 * user-editable section of the dsh user settings document: the auto-refresh
 * cadence and the git tab's per-command timeout. The id and defaults live in
 * the contract (dependency-free) so both halves — the host that registers the
 * schema and serve the section, and the client that reads/reacts to it — use
 * one source of truth. The schemastery schema itself lives in the host half
 * (schemastery is a host-side runtime dependency).
 */
/** Settings namespace for this plugin's user-editable tunables. */
export declare const SETTINGS_NAMESPACE: "dsh-better-sidebar";
/** Defaults shared by the host schema and the client baseline. */
export declare const SETTINGS_DEFAULTS: {
    /** Explorer fallback stamp-poll cadence in ms (ADR-004 §3 amendment). */
    readonly explorerPollMs: 100;
    /** Explorer session-dirty debounce in ms. */
    readonly explorerDebounceMs: 600;
    /** Git fallback status-poll cadence in ms (git tab auto-refresh). */
    readonly gitPollMs: 100;
    /** Git session-dirty debounce in ms. */
    readonly gitDebounceMs: 600;
    /** Per-git-command timeout in ms (mirrors the legacy cordis `gitTimeoutMs`). */
    readonly gitTimeoutMs: 15000;
    /** Skills-tab fallback poll cadence in ms. */
    readonly skillsPollMs: 100;
};
/** The plugin's settings section as the browser reads/reacts to it. */
export interface BetterSidebarSettings {
    /** Explorer fallback stamp-poll cadence in ms. */
    explorerPollMs: number;
    /** Explorer session-dirty debounce in ms. */
    explorerDebounceMs: number;
    /** Git fallback status-poll cadence in ms. */
    gitPollMs: number;
    /** Git session-dirty debounce in ms. */
    gitDebounceMs: number;
    /** Per-git-command timeout in ms. */
    gitTimeoutMs: number;
    /** Skills-tab fallback poll cadence in ms. */
    skillsPollMs: number;
}
/** Last-seen defaults for callers that keep their own copy of one field. */
export declare const SETTING_FIELDS: readonly (keyof BetterSidebarSettings)[];
/** User-editable bounds shared by the host schema and the client card validate. */
export declare const SETTING_RANGES: Record<keyof BetterSidebarSettings, {
    min: number;
    max: number;
}>;
//# sourceMappingURL=settings.d.ts.map