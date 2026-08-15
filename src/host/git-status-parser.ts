/**
 * Pure porcelain v1 -z status parser (D6 §5.4, d3 §5.4).
 *
 * Layout: ONLY NUL separates records. Non-rename records are
 * `XY<space>path<NUL>`; rename/copy records carry a continuation
 * `origPath<NUL>` (DEST then SOURCE, verified on git 2.54). We decode raw
 * bytes; `-z` never C-quotes so there is nothing to unquote.
 */
import type { GitStatusEntry } from '../contract/index.ts'

const SPACE = 0x20
const NUL = 0x00

/** Read one byte; a run past the end yields null. */
function readByte(buf: Uint8Array, i: number): number | null {
  return buf[i] ?? null
}

/** Unmerged index/worktree XY pairs: the entry is conflicted and nothing else. */
const UNMERGED = new Set(['UU', 'DD', 'AU', 'UD', 'UA', 'DU', 'AA'])

/**
 * Derive grouping flags from an XY pair. Unmerged pairs are conflicted-only;
 * otherwise staged/unstaged follow the index/worktree column and untracked is
 * signalled by a '?' in the worktree column ('??', 'A?', ' ?').
 */
function xyToFlags(xy: string): Pick<GitStatusEntry, 'staged' | 'unstaged' | 'untracked' | 'conflicted'> {
  if (UNMERGED.has(xy)) {
    return { staged: false, unstaged: false, untracked: false, conflicted: true }
  }
  const x = xy[0] ?? ''
  const y = xy[1] ?? ''
  return {
    staged: x !== ' ' && x !== '?',
    unstaged: y !== ' ' && y !== '?',
    untracked: y === '?',
    conflicted: false,
  }
}

/** Decode a UTF-8 subarray. -z output is not C-quoted; this is lossy for non-UTF-8. */
function decodeUtf8(buf: Uint8Array, from: number, to: number): string {
  return Buffer.from(buf.subarray(from, to)).toString('utf8')
}

/**
 * Parse `git status --porcelain=v1 -z` output into typed entries.
 *
 * DEST-then-SOURCE rename contract (d3 §5.4): an 'R'/'C' record's path is the
 * destination and the immediately following bare record is the source, so
 * `path` = dest and `originalPath` = source. Trailing-slash paths (collapsed
 * untracked dirs under --untracked-files=normal) keep their trailing slash in
 * `path` so a client can detect the collapsed-directory form.
 */
export function parsePorcelainV1Z(buf: Uint8Array): GitStatusEntry[] {
  const entries: GitStatusEntry[] = []
  let i = 0
  while (i + 4 <= buf.length) {
    const x = readByte(buf, i)
    const y = readByte(buf, i + 1)
    if (x === null || y === null) break
    if (buf[i + 2] !== SPACE) break // malformed record; stop at the first bad header
    const xy = String.fromCharCode(x) + String.fromCharCode(y)
    // Read path until NUL.
    let end = i + 3
    while (end < buf.length && buf[end] !== NUL) end++
    const path = decodeUtf8(buf, i + 3, end)
    i = end + 1

    let originalPath: string | undefined
    if (xy[0] === 'R' || xy[1] === 'R' || xy[0] === 'C' || xy[1] === 'C') {
      let o = i
      while (o < buf.length && buf[o] !== NUL) o++
      originalPath = decodeUtf8(buf, i, o)
      i = o + 1
    }
    entries.push(buildEntry(xy, path, originalPath))
  }
  return entries
}

/** Assemble one typed entry from an XY pair. */
function buildEntry(xy: string, path: string, originalPath: string | undefined): GitStatusEntry {
  const submodule = xy[0] === 'S' || xy[1] === 'S'
  return {
    xy,
    path,
    ...(originalPath === undefined ? {} : { originalPath }),
    submodule,
    ...xyToFlags(xy),
  }
}
