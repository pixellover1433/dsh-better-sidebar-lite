/**
 * Pure porcelain v1 -z status parser (D6 §5.4, d3 §5.4).
 *
 * Layout: ONLY NUL separates records. Non-rename records are
 * `XY<space>path<NUL>`; rename/copy records carry a continuation
 * `origPath<NUL>` (DEST then SOURCE, verified on git 2.54). We decode raw
 * bytes; `-z` never C-quotes so there is nothing to unquote.
 */
import type { GitStatusEntry } from '../contract/index.ts';
/**
 * Parse `git status --porcelain=v1 -z` output into typed entries.
 *
 * DEST-then-SOURCE rename contract (d3 §5.4): an 'R'/'C' record's path is the
 * destination and the immediately following bare record is the source, so
 * `path` = dest and `originalPath` = source. Trailing-slash paths (collapsed
 * untracked dirs under --untracked-files=normal) keep their trailing slash in
 * `path` so a client can detect the collapsed-directory form.
 */
export declare function parsePorcelainV1Z(buf: Uint8Array): GitStatusEntry[];
//# sourceMappingURL=git-status-parser.d.ts.map