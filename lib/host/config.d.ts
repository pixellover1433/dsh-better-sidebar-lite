/**
 * Host plugin configuration (D6 §6). Mirrors the client-connection pattern:
 * a BetterSidebarConfig interface + a schemastery Config schema for Loader
 * validation, plus a resolveConfig that fills defaults for direct embeds
 * (tests) that skip the Loader.
 */
import z from '@deepseek-ai/schemastery';
/** Untracked-file reporting mode (D6 §5.3). 'all' lists every untracked file; 'normal' collapses directories. */
export type UntrackedMode = 'all' | 'normal';
/**
 * Raw, all-optional user config. Mirrors the schema's accepted surface so
 * `Config: z<BetterSidebarConfig>` typechecks under exactOptionalPropertyTypes.
 */
export interface BetterSidebarConfig {
    /** Absolute roots the explorer may list. Empty = any absolute readable dir (trust boundary: authority loopback). */
    allowedRoots?: string[];
    /** Per-git-command timeout in ms, clamped to [100, 120_000]. */
    gitTimeoutMs?: number;
    /** Per-level explorer listing cap. */
    maxEntriesPerListing?: number;
    /** git log -n cap (page size). */
    maxLogEntries?: number;
    /** git status entry cap. */
    maxStatusEntries?: number;
    /** Read-cap on one file's text content in bytes (open-file editor); larger files truncate. */
    maxReadBytes?: number;
    /** untracked reporting mode: 'all' (default) or 'normal'. */
    untrackedFiles?: UntrackedMode;
    /** Basenames hidden by default in explorer listings. */
    hidePatterns?: string[];
    /** Git executable name or path; test override. */
    gitExecutable?: string;
}
/** Fully-populated config as consumed by the services. */
export interface ResolvedConfig {
    allowedRoots: readonly string[];
    gitTimeoutMs: number;
    maxEntriesPerListing: number;
    maxLogEntries: number;
    maxStatusEntries: number;
    maxReadBytes: number;
    untrackedFiles: UntrackedMode;
    hidePatterns: readonly string[];
    gitExecutable: string;
}
/**
 * Build the runtime config from (possibly partial) user config, applying
 * defaults and the git-timeout clamp. The Loader validates against the Schema;
 * this is the code path tests and direct embeds take.
 */
export declare function resolveConfig(config?: BetterSidebarConfig): ResolvedConfig;
/** Schemastery schema for Loader/config-panel validation. */
export declare const Config: z<BetterSidebarConfig>;
//# sourceMappingURL=config.d.ts.map