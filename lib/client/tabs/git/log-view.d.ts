/**
 * Git commit log view (ADR-004): a newest-first list of GitLogEntry rows plus a
 * "Load more" control when the page is truncated. No merge badge in v1 — the
 * contract's GitLogEntry carries no parents field, so merge commits are not
 * distinguishable; add that field and a badge when log detail becomes a goal.
 */
import type { GitLogEntry, GitLogResult } from '../../../contract/git.ts';
import type { GitKey } from './locales.ts';
export interface GitLogViewProps {
    /** Loaded log result (never null). */
    result: GitLogResult;
    /** Bound git-namespace translate. */
    t: (key: GitKey, params?: Record<string, unknown>) => string;
    /** Invoked when the user requests the next page (parent refetches with a larger limit). */
    onLoadMore: () => void;
    /** Invoked when the user clicks a commit row (opens its changed-files view). */
    onSelectCommit: (entry: GitLogEntry) => void;
}
export declare function GitLogView({ result, t, onLoadMore, onSelectCommit }: GitLogViewProps): import("react").JSX.Element;
//# sourceMappingURL=log-view.d.ts.map