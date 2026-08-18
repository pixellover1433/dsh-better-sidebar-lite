/**
 * Host plugin configuration (D6 §6). Mirrors the client-connection pattern:
 * a BetterSidebarConfig interface + a schemastery Config schema for Loader
 * validation, plus a resolveConfig that fills defaults for direct embeds
 * (tests) that skip the Loader.
 */
import z from '@deepseek-ai/schemastery';
import { HOST_DEFAULTS } from "../contract/rpc.js";
const GIT_TIMEOUT_MIN = 100;
const GIT_TIMEOUT_MAX = 120_000;
const DEFAULTS = HOST_DEFAULTS;
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
/**
 * Build the runtime config from (possibly partial) user config, applying
 * defaults and the git-timeout clamp. The Loader validates against the Schema;
 * this is the code path tests and direct embeds take.
 */
export function resolveConfig(config) {
    return {
        allowedRoots: config?.allowedRoots ?? [],
        gitTimeoutMs: clamp(config?.gitTimeoutMs ?? 15_000, GIT_TIMEOUT_MIN, GIT_TIMEOUT_MAX),
        maxEntriesPerListing: config?.maxEntriesPerListing ?? DEFAULTS.maxEntriesPerListing,
        maxLogEntries: config?.maxLogEntries ?? DEFAULTS.maxLogEntries,
        maxStatusEntries: config?.maxStatusEntries ?? DEFAULTS.maxStatusEntries,
        maxReadBytes: config?.maxReadBytes ?? DEFAULTS.maxReadBytes,
        untrackedFiles: config?.untrackedFiles ?? 'all',
        hidePatterns: config?.hidePatterns ?? ['.git', 'node_modules'],
        gitExecutable: config?.gitExecutable ?? 'git',
    };
}
/** Schemastery schema for Loader/config-panel validation. */
export const Config = z.object({
    allowedRoots: z.array(String).default([]),
    gitTimeoutMs: z.natural().min(GIT_TIMEOUT_MIN).max(GIT_TIMEOUT_MAX).default(15_000),
    maxEntriesPerListing: z.natural().min(1).max(50_000).default(DEFAULTS.maxEntriesPerListing),
    maxLogEntries: z.natural().min(1).max(5_000).default(DEFAULTS.maxLogEntries),
    maxStatusEntries: z.natural().min(1).max(50_000).default(DEFAULTS.maxStatusEntries),
    maxReadBytes: z.natural().min(1).max(1024 * 1024 * 1024).default(DEFAULTS.maxReadBytes),
    untrackedFiles: z.union([z.const('all'), z.const('normal')]).default('all'),
    hidePatterns: z.array(String).default(['.git', 'node_modules']),
    gitExecutable: z.string(),
});
//# sourceMappingURL=config.js.map