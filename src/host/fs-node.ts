/**
 * Real FsPort adapter over node:fs/promises + node:path (D6 §4.1).
 * The single production FsPort; tests may inject their own.
 */
import { promises as fsPromises, type StatOptions } from 'node:fs'
import * as path from 'node:path'
import type { FsPort } from './port-fs.ts'

/** Normalize mixed separators to '/' for case-insensitive containment checks. */
function normalizeSeparators(p: string): string {
  return p.replace(/[\\/]/g, '/')
}

/**
 * POSIX/Windows-aware containment. On Windows the comparison is
 * case-insensitive; everywhere it uses a boundary so `C:\foo` is inside
 * `C:\foo` but not `C:\foobar`.
 */
function isInsidePath(child: string, base: string, caseInsensitive: boolean): boolean {
  const c = normalizeSeparators(child)
  const b = normalizeSeparators(base)
  if (c === b) return true
  const prefix = b.endsWith('/') ? b : b + '/'
  return caseInsensitive
    ? c.toLowerCase().startsWith(prefix.toLowerCase())
    : c.startsWith(prefix)
}

/** Whether the process treats paths as case-insensitive (Windows). */
const caseInsensitive = process.platform === 'win32'

export const fsNode: FsPort = {
  readdir: (p, opts) => fsPromises.readdir(p, opts),
  stat: (p, opts) => fsPromises.stat(p, opts as StatOptions | undefined) as Promise<import('node:fs').Stats | undefined>,
  readFile: (p) => fsPromises.readFile(p, 'utf8'),
  readlink: (p) => fsPromises.readlink(p),
  realpath: (p) => fsPromises.realpath(p),
  isAbsolute: (p) => path.isAbsolute(p),
  resolve: (...parts) => path.resolve(...parts),
  sep: path.sep,
  isInside: (child, base) => isInsidePath(child, base, caseInsensitive),
}
