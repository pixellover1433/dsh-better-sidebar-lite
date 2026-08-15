/**
 * Explorer models shared by host (producer) and client (consumer).
 * Pure types + one pure sort function; no Node/DOM/React imports.
 */

export type ExplorerEntryKind = 'file' | 'directory' | 'symlink'

/** One row of a directory listing. */
export interface ExplorerEntry {
  /** Base name shown in the tree row. */
  name: string
  /** Absolute host path; the client never joins paths itself. */
  path: string
  /** Derived kind for rendering + lazy-load. Symlinks are never followed. */
  kind: ExplorerEntryKind
  /** True when the basename matches a hide pattern; the client still decides visibility. */
  hidden: boolean
  /** Present when kind === 'symlink'; the link target verbatim (never resolved). */
  linkTarget?: string
}

export interface ExplorerListRequest {
  /** Absolute directory path to list (one level, lazy). */
  path: string
}

export interface ExplorerListResult {
  /** Echo of the requested path (identity anchor for stale-response guards). */
  path: string
  entries: ExplorerEntry[]
  /** True when the listing was cut at the host's entry cap. */
  truncated: boolean
}

/**
 * Deterministic listing order: directories first, then locale-aware name
 * comparison, then full path as a stable tie-break. Pure and shared so host
 * and client tests pin the same order.
 */
export function compareEntries(a: ExplorerEntry, b: ExplorerEntry): number {
  const aDir = a.kind === 'directory' ? 0 : 1
  const bDir = b.kind === 'directory' ? 0 : 1
  if (aDir !== bDir) return aDir - bDir
  const byName = defaultCollator.compare(a.name, b.name)
  if (byName !== 0) return byName
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0
}

// Module-level collator: created once, shared by every listing.
const defaultCollator = new Intl.Collator(undefined, { sensitivity: 'base' })
