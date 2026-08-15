/**
 * ExplorerService (D6 §4). Lists one directory level from an absolute host path
 * with type-safe symlink handling, dirs-first sorting, hiding, and caps.
 * Cordis-free: constructed with an FsPort + numeric/basename config.
 */
import type { Dirent } from 'node:fs'
import {
  compareEntries,
  HOST_DEFAULTS,
  sidebarError,
  type ExplorerEntry,
  type ExplorerListRequest,
  type ExplorerListResult,
  type SidebarError,
} from '../contract/index.ts'
import type { FsPort } from './port-fs.ts'

/** ExplorerService construction options. */
export interface ExplorerOptions {
  /** Per-level listing cap (default 2000); exceeding sets truncated. */
  maxEntries: number
  /** Basenames hidden by default (.git, node_modules). */
  hidePatterns: readonly string[]
  /** Absolute roots allowed to be listed. Empty/undefined = any absolute readable dir. */
  allowedRoots?: readonly string[]
}

/** Build a SidebarError branch that carries a path. */
function errPath(
  code: 'not-found' | 'permission-denied' | 'not-directory' | 'symlink-loop' | 'outside-allowed-root' | 'param-invalid',
  message: string,
  path: string,
): SidebarError {
  return { code, message, path } as SidebarError
}

/** Map a node fs error to a typed SidebarError (D6 §4.7). */
export function mapFSError(raw: unknown, path: string): SidebarError {
  const e = raw as NodeJS.ErrnoException
  switch (e.code) {
    case 'ENOENT': return errPath('not-found', e.message ?? String(raw), path)
    case 'EACCES':
    case 'EPERM': return errPath('permission-denied', e.message ?? String(raw), path)
    case 'ENOTDIR': return errPath('not-directory', e.message ?? String(raw), path)
    case 'ELOOP': return errPath('symlink-loop', e.message ?? String(raw), path)
    default: return sidebarError('internal', e?.message ?? String(raw))
  }
}

export class ExplorerService {
  constructor(
    private readonly fs: FsPort,
    private readonly opts: ExplorerOptions,
  ) {}

  /**
   * List one directory level. Resolves/validates the root, reads entries,
   * sorts dirs-first, applies the entry-count and cumulative-byte caps.
   * Rejects with a typed SidebarError on invalid roots / fs errors.
   */
  async list(request: ExplorerListRequest): Promise<ExplorerListResult> {
    const root = await this.assertListableRoot(request.path)
    const dirents = await this.readDir(root)
    const entries: ExplorerEntry[] = []
    for (const dirent of dirents) {
      entries.push(await this.toEntry(root, dirent))
    }
    entries.sort(compareEntries)
    return this.applyCaps(root, entries)
  }

  /** Validate the root before any listing (D6 §4.6). */
  private async assertListableRoot(candidate: string): Promise<string> {
    if (!this.fs.isAbsolute(candidate)) {
      throw errPath('param-invalid', 'path must be absolute', candidate)
    }
    if (candidate.length > HOST_DEFAULTS.maxRequestPathLength) {
      throw errPath('param-invalid', 'path too long', candidate)
    }
    const root = this.fs.resolve(candidate)
    const roots = this.opts.allowedRoots
    if (roots !== undefined && roots.length > 0) {
      const inside = roots.some(base => this.fs.isInside(root, base))
      if (!inside) {
        throw errPath('outside-allowed-root', root + ' is outside configured allowed roots', root)
      }
    }
    let st
    try {
      st = await this.fs.stat(root, { throwIfNoEntry: false })
    } catch (raw) {
      throw mapFSError(raw, root)
    }
    if (st === undefined) {
      throw errPath('not-found', 'path does not exist', root)
    }
    if (!st.isDirectory()) {
      throw errPath('not-directory', 'expected a directory', root)
    }
    return root
  }

  private async readDir(root: string): Promise<Dirent[]> {
    try {
      return await this.fs.readdir(root, { withFileTypes: true })
    } catch (raw) {
      throw mapFSError(raw, root)
    }
  }

  /** Map one Dirent to an ExplorerEntry (symlinks reported, never followed). */
  private async toEntry(root: string, dirent: Dirent): Promise<ExplorerEntry> {
    const name = dirent.name
    const p = this.fs.resolve(root, name)
    if (dirent.isSymbolicLink()) {
      const linkTarget = await this.readlinkBestEffort(p)
      return {
        name,
        path: p,
        kind: 'symlink',
        hidden: this.isHidden(name),
        ...(linkTarget === undefined ? {} : { linkTarget }),
      }
    }
    return {
      name,
      path: p,
      kind: dirent.isDirectory() ? 'directory' : 'file',
      hidden: this.isHidden(name),
    }
  }

  private isHidden(name: string): boolean {
    return this.opts.hidePatterns.includes(name)
  }

  /** Readlink verbatim; only a vanished symlink yields no target (the entry
   * still renders as a symlink row). Any other readlink failure is a real
   * error and fails the listing like every other fs error. */
  private async readlinkBestEffort(p: string): Promise<string | undefined> {
    try {
      return await this.fs.readlink(p)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }

  /** Apply the entry-count and cumulative-path-byte caps (D6 §4.5). */
  private applyCaps(root: string, sorted: ExplorerEntry[]): ExplorerListResult {
    const out: ExplorerEntry[] = []
    let truncated = false
    let bytes = 0
    for (const entry of sorted) {
      if (out.length >= this.opts.maxEntries) {
        truncated = true
        break
      }
      const add = entry.name.length + entry.path.length
      if (bytes + add > HOST_DEFAULTS.totalListingPathBytes) {
        truncated = true
        break
      }
      out.push(entry)
      bytes += add
    }
    return { path: root, entries: out, truncated }
  }
}