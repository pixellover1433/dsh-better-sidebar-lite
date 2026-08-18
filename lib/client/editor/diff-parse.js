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
/** Matches a unified hunk header: `@@ -a,b +c,d @@` (counts are optional). */
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
export function parseUnifiedDiff(diff) {
    const lines = diff.split('\n');
    const hunks = [];
    let current;
    let oldLine = 0;
    let newLine = 0;
    for (const raw of lines) {
        const header = HUNK_HEADER.exec(raw);
        if (header !== null) {
            oldLine = Number(header[1]);
            newLine = Number(header[3]);
            current = { oldStart: oldLine, newStart: newLine, rows: [] };
            hunks.push(current);
            continue;
        }
        if (current === undefined)
            continue; // header/meta lines before the first hunk
        if (raw.length === 0)
            continue; // trailing blank
        const marker = raw.charAt(0);
        if (marker === '\\')
            continue; // "No newline at end of file" — not a code line
        if (marker === ' ') {
            current.rows.push({ type: 'context', text: raw.slice(1), oldLine, newLine });
            oldLine += 1;
            newLine += 1;
        }
        else if (marker === '-') {
            current.rows.push({ type: 'delete', text: raw.slice(1), oldLine, newLine: undefined });
            oldLine += 1;
        }
        else if (marker === '+') {
            current.rows.push({ type: 'add', text: raw.slice(1), oldLine: undefined, newLine });
            newLine += 1;
        }
        // Any other line (e.g. a `diff --git` header between hunks) is skipped
        // without disturbing the line counters.
    }
    return hunks.length > 0 ? hunks : null;
}
//# sourceMappingURL=diff-parse.js.map