/**
 * Unified-diff parser (ADR-004): turns the raw unified patch text the host's
 * `git/diff` endpoint returns into a structured, hunk-aligned row model that the
 * FileModalEditor paints as a two-pane (old/new) side-by-side diff. Pure logic —
 * no DOM or React — so it stays trivially unit-testable and framework-free.
 *
 * A unified hunk lists changes as lines prefixed by git: ` ` (context), `-`
 * (deleted), `+` (added), plus `\ No newline at end of file` markers. Deleted
 * lines exist only on the old side, added lines only on the new side, and
 * context lines on both. We align them into per-hunk rows where both pane cells
 * derive from one row, mirroring how GitHub/IDE side-by-side diffs pair the two
 * sides.
 */

/** One aligned diff row: how the two pane cells derive from it. */
export interface DiffRow {
  /** Line content with the leading `+`/`-`/` ` marker removed. */
  readonly text: string
  /** 'context' appears on both sides; 'add' only on the right; 'delete' only on the left. */
  readonly type: 'context' | 'add' | 'delete'
  /** Old-file (left) line number; undefined for pure additions. */
  readonly oldLine: number | undefined
  /** New-file (right) line number; undefined for pure deletions. */
  readonly newLine: number | undefined
}

/** One `@@` hunk with its rows ordered as git emitted them. */
export interface DiffHunk {
  /** 1-based old-file line where this hunk starts. */
  readonly oldStart: number
  /** 1-based new-file line where this hunk starts. */
  readonly newStart: number
  /** The hunk's rows; `oldLine`+`newLine` increment through them. */
  readonly rows: readonly DiffRow[]
}

/** Matches a unified hunk header: `@@ -a,b +c,d @@` (counts are optional). */
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

/**
 * Parse a unified diff into hunk-aligned rows.
 *
 * @param diff - raw unified patch text (utf8) from the host's `git/diff`.
 * @returns the parsed hunks, or `null` when the text is not a parseable unified
 *   diff (no well-formed `@@` hunk). Callers fall back to rendering the raw text
 *   on `null` so a malformed patch degrades gracefully instead of crashing.
 */
/** Mutable accumulator used while scanning; frozen to `DiffHunk` at the end. */
interface MutableHunk {
  oldStart: number
  newStart: number
  rows: DiffRow[]
}

export function parseUnifiedDiff(diff: string): DiffHunk[] | null {
  const lines = diff.split('\n')
  const hunks: MutableHunk[] = []
  let current: MutableHunk | undefined
  let oldLine = 0
  let newLine = 0

  for (const raw of lines) {
    const header = HUNK_HEADER.exec(raw)
    if (header !== null) {
      oldLine = Number(header[1])
      newLine = Number(header[3])
      current = { oldStart: oldLine, newStart: newLine, rows: [] }
      hunks.push(current)
      continue
    }
    if (current === undefined) continue // header/meta lines before the first hunk
    if (raw.length === 0) continue // trailing blank
    const marker = raw.charAt(0)
    if (marker === '\\') continue // "No newline at end of file" — not a code line

    if (marker === ' ') {
      current.rows.push({ type: 'context', text: raw.slice(1), oldLine, newLine })
      oldLine += 1
      newLine += 1
    } else if (marker === '-') {
      current.rows.push({ type: 'delete', text: raw.slice(1), oldLine, newLine: undefined })
      oldLine += 1
    } else if (marker === '+') {
      current.rows.push({ type: 'add', text: raw.slice(1), oldLine: undefined, newLine })
      newLine += 1
    }
    // Any other line (e.g. a `diff --git` header between hunks) is skipped
    // without disturbing the line counters.
  }

  return hunks.length > 0 ? hunks : null
}
