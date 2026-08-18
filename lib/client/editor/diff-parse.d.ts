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
    readonly text: string;
    /** 'context' appears on both sides; 'add' only on the right; 'delete' only on the left. */
    readonly type: 'context' | 'add' | 'delete';
    /** Old-file (left) line number; undefined for pure additions. */
    readonly oldLine: number | undefined;
    /** New-file (right) line number; undefined for pure deletions. */
    readonly newLine: number | undefined;
}
/** One `@@` hunk with its rows ordered as git emitted them. */
export interface DiffHunk {
    /** 1-based old-file line where this hunk starts. */
    readonly oldStart: number;
    /** 1-based new-file line where this hunk starts. */
    readonly newStart: number;
    /** The hunk's rows; `oldLine`+`newLine` increment through them. */
    readonly rows: readonly DiffRow[];
}
export declare function parseUnifiedDiff(diff: string): DiffHunk[] | null;
//# sourceMappingURL=diff-parse.d.ts.map