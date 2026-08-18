/**
 * GitService (D6 §5.5): status/log orchestration plus stage/unstage over the
 * GitRunner. Every public method returns a SidebarResult, never throws. The
 * runner classification is translated to the contract's typed error union.
 */
import { type GitCommitFile, type GitCommitDetailRequest, type GitCommitDetailResult, type GitCommitFileDiffRequest, type GitCommitFileDiffResult, type GitCommitRequest, type GitCommitResult, type GitDiffRequest, type GitDiffResult, type GitDiscardRequest, type GitLogRequest, type GitLogResult, type GitStageRequest, type GitStatusRequest, type GitStatusResult, type SidebarResult } from '../contract/index.ts';
import { GitRunner } from './git-runner.ts';
/** Untracked reporting mode forwarded verbatim to git status. */
export type UntrackedMode = 'all' | 'normal';
export interface GitServiceOptions {
    maxLogEntries: number;
    maxStatusEntries: number;
    untrackedFiles: UntrackedMode;
}
export declare class GitService {
    private readonly runner;
    private readonly opts;
    constructor(runner: GitRunner, opts: GitServiceOptions);
    /**
     * Probe the repo: gate not-a-repo and yield the current branch head.
     * Runs rev-parse in `cwd`; git walks up to the worktree root.
     */
    private probe;
    status(request: GitStatusRequest, signal?: AbortSignal): Promise<SidebarResult<GitStatusResult>>;
    log(request: GitLogRequest, signal?: AbortSignal): Promise<SidebarResult<GitLogResult>>;
    commitDetail(request: GitCommitDetailRequest, signal?: AbortSignal): Promise<SidebarResult<GitCommitDetailResult>>;
    /**
     * Diff a single changed file against its base. `git diff` (base 'index')
     * compares the working tree to the index; `git diff --cached` (base 'head')
     * compares the index to HEAD. Untracked files have no tracked base, so the
     * git tab never routes them here — the editor shows the full file instead.
     */
    diff(request: GitDiffRequest, signal?: AbortSignal): Promise<SidebarResult<GitDiffResult>>;
    /**
     * Diff a single file as introduced by an OLD commit (git show <hash> -- <file>).
     * The diff is computed against the commit's parent(s) straight from the repo
     * object database, so it reflects history rather than the current working
     * tree and works even when the file's working-tree copy has since changed or
     * been deleted. For a root commit this diffs against the empty tree.
     */
    commitFileDiff(request: GitCommitFileDiffRequest, signal?: AbortSignal): Promise<SidebarResult<GitCommitFileDiffResult>>;
    stage(request: GitStageRequest, signal?: AbortSignal): Promise<SidebarResult<null>>;
    unstage(request: GitStageRequest, signal?: AbortSignal): Promise<SidebarResult<null>>;
    /**
     * Discard working-tree changes: restore tracked files from HEAD and remove
     * untracked paths (git clean). Splitting avoids discarding a tracked file
     * as untracked; a mix produces up to two commands.
     */
    discard(request: GitDiscardRequest, signal?: AbortSignal): Promise<SidebarResult<null>>;
    /**
     * Create a commit. Optionally stage `files` first (untracked + unstaged the
     * user chose to include), then commit the index with the message written to
     * git via stdin (-F -) so it never crosses argv or the shell.
     */
    commit(request: GitCommitRequest, signal?: AbortSignal): Promise<SidebarResult<GitCommitResult>>;
    /** Run a probe, then a body that produces a typed result. */
    private withProbe;
    /** stage/unstage run a single fixed git command; failures map to errors. */
    private applyToFiles;
    private group;
    /** Parse log records (fields 0x1f, records 0x1e). A subject containing the separator drops that record. */
    private parseLog;
}
/**
 * Parse `git diff-tree --name-status -z` output into per-file records.
 * With -z every FIELD is its own NUL record: 'M<NUL>path<NUL>' and
 * 'R100<NUL>old<NUL>new<NUL>' (rename source FIRST, unlike porcelain
 * status -z). -z disables C-quoting, so paths with spaces parse verbatim.
 */
export declare function parseNameStatus(stdout: Buffer): GitCommitFile[];
//# sourceMappingURL=git.d.ts.map