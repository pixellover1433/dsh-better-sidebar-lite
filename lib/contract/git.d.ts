/**
 * Git models shared by host (producer) and client (consumer).
 * Pure types; no Node/DOM/React imports.
 */
/** One changed path with its porcelain XY pair. */
export interface GitStatusEntry {
    /** Porcelain v1 XY pair, e.g. ' M', '??', 'R '. */
    xy: string;
    /** Path as git reported it (repo-relative). */
    path: string;
    /** Rename/copy origin (present when x or y is R/C). */
    originalPath?: string;
    /** True when a submodule slot (x or y === 'S'). */
    submodule: boolean;
    staged: boolean;
    unstaged: boolean;
    untracked: boolean;
    conflicted: boolean;
}
export interface GitStatusResult {
    staged: GitStatusEntry[];
    unstaged: GitStatusEntry[];
    untracked: GitStatusEntry[];
    conflicted: GitStatusEntry[];
    /** True when the entry cap cut the list. */
    truncated: boolean;
    /** Current branch, absent on detached HEAD. */
    head?: string;
}
export interface GitStatusRequest {
    /** Absolute path of the work tree root. */
    path: string;
}
export interface GitLogRequest {
    /** Absolute path of the work tree root. */
    path: string;
    /** Page size; host clamps into [1, maxLogEntries]. */
    limit?: number;
}
export interface GitLogEntry {
    /** Full object id. */
    hash: string;
    /** Abbreviated id as git reports it. */
    shortHash: string;
    authorName: string;
    authorEmail: string;
    /** Author date, strict ISO-8601 from %aI. */
    authoredAtISO: string;
    /** First line of the commit message (never contains newlines). */
    subject: string;
}
export interface GitStageRequest {
    /** Absolute path of the work tree root. */
    path: string;
    /** Repo-relative paths to stage (git add) or unstage (git restore --staged). */
    files: readonly string[];
}
export interface GitLogResult {
    entries: GitLogEntry[];
    /** Current branch, absent on detached HEAD. */
    head?: string;
    /** True when more commits exist beyond the requested page. */
    truncated: boolean;
}
/** A file touched by one commit (git diff-tree --name-status). */
export type GitFileStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U' | 'X' | 'B';
export interface GitCommitFile {
    /** Status letter from --name-status (A/M/D/R/C/T/U/X/B). */
    status: GitFileStatus;
    /** Path in the new tree (rename/copy destination). */
    path: string;
    /** Rename/copy source (present when status is R or C). */
    originalPath?: string;
    /** Similarity score 0-100 (present when status is R or C). */
    score?: number;
}
export interface GitCommitDetailRequest {
    /** Absolute path of the work tree root. */
    path: string;
    /** Commit id (full or abbreviated). */
    hash: string;
}
export interface GitCommitDetailResult {
    /** Full commit message (subject + body), trailing whitespace trimmed. */
    message: string;
    /** Files changed in the commit, in git's report order. */
    files: GitCommitFile[];
}
export interface GitDiscardRequest {
    /** Absolute path of the work tree root. */
    path: string;
    /** Repo-relative paths to discard (restore worktree / clean untracked). */
    files: readonly string[];
}
export interface GitCommitRequest {
    /** Absolute path of the work tree root. */
    path: string;
    /** Commit message (subject + optional body), passed to git via stdin. */
    message: string;
    /** Repo-relative paths to commit; empty means commit all staged (no add). */
    files: readonly string[];
}
export interface GitCommitResult {
    /** The new commit's full object id. */
    hash: string;
}
/** Diff base of a git/diff request: which two trees to compare. */
export type GitDiffBase = 'index' | 'head';
export interface GitDiffRequest {
    /** Absolute path of the work tree root. */
    path: string;
    /** Repo-relative path of the file to diff (path-safe like stage/discard). */
    file: string;
    /** 'index' = working tree vs index (git diff); 'head' = index vs HEAD (git diff --cached). */
    base: GitDiffBase;
}
export interface GitDiffResult {
    /** Unified diff text for the file (utf8). */
    diff: string;
    /** True when git reported no diff for the file (e.g. a tracked file with no change). */
    empty: boolean;
}
export interface GitCommitFileDiffRequest {
    /** Absolute path of the work tree root. */
    path: string;
    /** Commit id (full or abbreviated) whose version of the file to diff. */
    hash: string;
    /** Repo-relative path of the file to diff (path-safe like stage/discard). */
    file: string;
}
export interface GitCommitFileDiffResult {
    /** Unified diff text for the file as of that commit (utf8). */
    diff: string;
    /** True when git reported no diff for the file (e.g. a file unchanged by the commit). */
    empty: boolean;
}
//# sourceMappingURL=git.d.ts.map