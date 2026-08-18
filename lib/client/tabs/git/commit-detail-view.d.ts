/**
 * Commit detail view: the full commit message plus the files it touched
 * (git/commit-detail). Replaces the log list while open; the parent owns the
 * fetch state.
 */
import type { GitCommitFile, GitCommitDetailResult, GitLogEntry } from '../../../contract/git.ts';
import type { GitKey } from './locales.ts';
export interface CommitDetailViewProps {
    commit: GitLogEntry;
    /** Fetch state: 'loading' | error message | loaded result. */
    state: {
        kind: 'loading';
    } | {
        kind: 'error';
        message: string;
    } | {
        kind: 'loaded';
        result: GitCommitDetailResult;
    };
    t: (key: GitKey, params?: Record<string, unknown>) => string;
    onBack: () => void;
    onRetry: () => void;
    /** Open a changed file's diff (double-click) via the shared open-file emitter. */
    onOpenFile: (file: GitCommitFile) => void;
}
export declare function CommitDetailView({ commit, state, t, onBack, onRetry, onOpenFile }: CommitDetailViewProps): import("react").JSX.Element;
//# sourceMappingURL=commit-detail-view.d.ts.map