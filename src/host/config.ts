/**
 * Host plugin configuration (D6 §6). Mirrors the client-connection pattern:
 * a BetterSidebarConfig interface + a schemastery Config schema for Loader
 * validation, plus a resolveConfig that fills defaults for direct embeds
 * (tests) that skip the Loader.
 */
import z from '@deepseek-ai/schemastery'
import { HOST_DEFAULTS } from '../contract/rpc.ts'

/** Untracked-file reporting mode (D6 §5.3). 'all' lists every untracked file; 'normal' collapses directories. */
export type UntrackedMode = 'all' | 'normal'

/**
 * Raw, all-optional user config. Mirrors the schema's accepted surface so
 * `Config: z<BetterSidebarConfig>` typechecks under exactOptionalPropertyTypes.
 */
export interface BetterSidebarConfig {
  /** Absolute roots the explorer may list. Empty = any absolute readable dir (trust boundary: authority loopback). */
  allowedRoots?: string[]
  /** Per-git-command timeout in ms, clamped to [100, 120_000]. */
  gitTimeoutMs?: number
  /** Per-level explorer listing cap. */
  maxEntriesPerListing?: number
  /** git log -n cap (page size). */
  maxLogEntries?: number
  /** git status entry cap. */
  maxStatusEntries?: number
  /** Read-cap on one file's text content in bytes (open-file editor); larger files truncate. */
  maxReadBytes?: number
  /** untracked reporting mode: 'all' (default) or 'normal'. */
  untrackedFiles?: UntrackedMode
  /** Basenames hidden by default in explorer listings. */
  hidePatterns?: string[]
  /** Git executable name or path; test override. */
  gitExecutable?: string
}

/** Fully-populated config as consumed by the services. */
export interface ResolvedConfig {
  allowedRoots: readonly string[]
  gitTimeoutMs: number
  maxEntriesPerListing: number
  maxLogEntries: number
  maxStatusEntries: number
  maxReadBytes: number
  untrackedFiles: UntrackedMode
  hidePatterns: readonly string[]
  gitExecutable: string
}

const GIT_TIMEOUT_MIN = 100
const GIT_TIMEOUT_MAX = 120_000
const DEFAULTS = HOST_DEFAULTS

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Build the runtime config from (possibly partial) user config, applying
 * defaults and the git-timeout clamp. The Loader validates against the Schema;
 * this is the code path tests and direct embeds take.
 */
export function resolveConfig(config?: BetterSidebarConfig): ResolvedConfig {
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
  }
}

/** Schemastery schema for Loader/config-panel validation. */
export const Config: z<BetterSidebarConfig> = z.object({
  allowedRoots: z.array(String).default([]),
  gitTimeoutMs: z.natural().min(GIT_TIMEOUT_MIN).max(GIT_TIMEOUT_MAX).default(15_000),
  maxEntriesPerListing: z.natural().min(1).max(50_000).default(DEFAULTS.maxEntriesPerListing),
  maxLogEntries: z.natural().min(1).max(5_000).default(DEFAULTS.maxLogEntries),
  maxStatusEntries: z.natural().min(1).max(50_000).default(DEFAULTS.maxStatusEntries),
  maxReadBytes: z.natural().min(1).max(1024 * 1024 * 1024).default(DEFAULTS.maxReadBytes),
  untrackedFiles: z.union([z.const('all'), z.const('normal')]).default('all'),
  hidePatterns: z.array(String).default(['.git', 'node_modules']),
  gitExecutable: z.string(),
})