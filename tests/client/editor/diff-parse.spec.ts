/**
 * Unified-diff parser unit tests (framework-free pure logic): verifies that
 * `parseUnifiedDiff` turns raw unified patch text into hunk-aligned rows with
 * correct old/new line numbering, and that malformed/empty input degrades to
 * `null` so the editor can fall back to raw text.
 */
import { describe, expect, it } from 'vitest'
import { parseUnifiedDiff } from '../../../src/client/editor/diff-parse.ts'

describe('parseUnifiedDiff', () => {
  it('returns null for an empty/garbage input with no hunk', () => {
    expect(parseUnifiedDiff('')).toBeNull()
    expect(parseUnifiedDiff('diff --git a/a.txt b/a.txt\n+++ b/a.txt\n')).toBeNull()
    expect(parseUnifiedDiff('not a diff at all')).toBeNull()
  })

  it('parses a single hunk with context, added, and deleted lines', () => {
    const patch = [
      'diff --git a/a.txt b/a.txt',
      'index 1111111..2222222 100644',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,3 +1,3 @@',
      ' alpha',
      '-gone',
      '+added',
      ' omega',
      '',
    ].join('\n')
    const hunks = parseUnifiedDiff(patch)
    expect(hunks).not.toBeNull()
    expect(hunks!.length).toBe(1)
    const hunk = hunks![0]!
    expect(hunk.oldStart).toBe(1)
    expect(hunk.newStart).toBe(1)
    expect(hunk.rows).toEqual([
      { type: 'context', text: 'alpha', oldLine: 1, newLine: 1 },
      { type: 'delete', text: 'gone', oldLine: 2, newLine: undefined },
      { type: 'add', text: 'added', oldLine: undefined, newLine: 2 },
      { type: 'context', text: 'omega', oldLine: 3, newLine: 3 },
    ])
  })

  it('advances line numbers across multiple hunks', () => {
    const patch = [
      '@@ -1,2 +1,2 @@',
      '-a',
      '+A',
      ' b',
      '@@ -10,3 +11,3 @@',
      '-x',
      '+X',
      ' y',
      '',
    ].join('\n')
    const hunks = parseUnifiedDiff(patch)
    expect(hunks).not.toBeNull()
    expect(hunks!.length).toBe(2)
    const [first, second] = hunks!
    expect(first!.oldStart).toBe(1)
    expect(first!.newStart).toBe(1)
    expect(second!.oldStart).toBe(10)
    expect(second!.newStart).toBe(11)
    expect(second!.rows[0]!).toMatchObject({ type: 'delete', text: 'x', oldLine: 10, newLine: undefined })
    expect(second!.rows[1]!).toMatchObject({ type: 'add', text: 'X', oldLine: undefined, newLine: 11 })
    expect(second!.rows[2]!).toMatchObject({ type: 'context', text: 'y', oldLine: 11, newLine: 12 })
  })

  it('ignores meta and "no newline" marker lines without disturbing counters', () => {
    const patch = [
      'diff --git a/a.txt b/a.txt',
      '@@ -2,2 +2,2 @@',
      ' keep',
      '\\ No newline at end of file',
      '-old',
      '+new',
      ' keep',
      '\\ No newline at end of file',
      '',
    ].join('\n')
    const hunks = parseUnifiedDiff(patch)
    expect(hunks).not.toBeNull()
    const rows = hunks![0]!.rows
    // Context, then delete/new, then context — markers contribute no rows.
    expect(rows).toEqual([
      { type: 'context', text: 'keep', oldLine: 2, newLine: 2 },
      { type: 'delete', text: 'old', oldLine: 3, newLine: undefined },
      { type: 'add', text: 'new', oldLine: undefined, newLine: 3 },
      { type: 'context', text: 'keep', oldLine: 4, newLine: 4 },
    ])
  })

  it('handles hunk headers without explicit counts (single-line ranges)', () => {
    const patch = ['@@ -3 +3 @@', '-old', '+new', ''].join('\n')
    const hunks = parseUnifiedDiff(patch)
    expect(hunks).not.toBeNull()
    expect(hunks![0]!.oldStart).toBe(3)
    expect(hunks![0]!.newStart).toBe(3)
    expect(hunks![0]!.rows).toHaveLength(2)
  })

  it('maps rows in git emission order for two-pane rendering', () => {
    const hunks = parseUnifiedDiff('@@ -1,1 +1,1 @@\n-removed\n+replacement\n')
    expect(hunks).not.toBeNull()
    expect(hunks!.flatMap(h => h.rows).map(r => r.type)).toEqual(['delete', 'add'])
  })
})
