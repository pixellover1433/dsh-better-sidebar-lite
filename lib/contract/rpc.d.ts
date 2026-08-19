/**
 * Endpoint table, request/response maps, payload guards, and shared caps
 * (ADR-002). Hand-rolled type-predicate guards keep the contract
 * dependency-free and usable on both halves.
 */
import type { ExplorerListRequest, ExplorerListResult, ExplorerReadRequest, ExplorerReadResult, ExplorerStampRequest, ExplorerStampResult } from './explorer.ts';
import type { GitCommitDetailRequest, GitCommitDetailResult, GitCommitFileDiffRequest, GitCommitFileDiffResult, GitCommitRequest, GitCommitResult, GitDiffRequest, GitDiffResult, GitDiscardRequest, GitLogRequest, GitLogResult, GitStageRequest, GitStatusRequest, GitStatusResult } from './git.ts';
import type { SkillListRequest, SkillListResult } from './skills.ts';
/** Endpoint names (also the wire method segment after the channel). */
export declare const Endpoints: {
    readonly explorerList: "explorer/list";
    readonly explorerStamp: "explorer/stamp";
    readonly explorerRead: "explorer/read";
    readonly gitStatus: "git/status";
    readonly gitLog: "git/log";
    readonly gitStage: "git/stage";
    readonly gitUnstage: "git/unstage";
    readonly gitCommitDetail: "git/commit-detail";
    readonly gitCommit: "git/commit";
    readonly gitDiscard: "git/discard";
    readonly gitDiff: "git/diff";
    readonly gitCommitFileDiff: "git/commit-file-diff";
    readonly skillsList: "skills/list";
};
export type BetterSidebarEndpoint = typeof Endpoints[keyof typeof Endpoints];
/** Request payload per endpoint. */
export interface BetterSidebarReqMap {
    'explorer/list': ExplorerListRequest;
    'explorer/stamp': ExplorerStampRequest;
    'explorer/read': ExplorerReadRequest;
    'git/status': GitStatusRequest;
    'git/log': GitLogRequest;
    'git/stage': GitStageRequest;
    'git/unstage': GitStageRequest;
    'git/commit-detail': GitCommitDetailRequest;
    'git/commit': GitCommitRequest;
    'git/discard': GitDiscardRequest;
    'git/diff': GitDiffRequest;
    'git/commit-file-diff': GitCommitFileDiffRequest;
    'skills/list': SkillListRequest;
}
/** Success value per endpoint. */
export interface BetterSidebarResMap {
    'explorer/list': ExplorerListResult;
    'explorer/stamp': ExplorerStampResult;
    'explorer/read': ExplorerReadResult;
    'git/status': GitStatusResult;
    'git/log': GitLogResult;
    'git/stage': null;
    'git/unstage': null;
    'git/commit-detail': GitCommitDetailResult;
    'git/commit': GitCommitResult;
    'git/discard': null;
    'git/diff': GitDiffResult;
    'git/commit-file-diff': GitCommitFileDiffResult;
    'skills/list': SkillListResult;
}
/** Host-side defaults; all are config-overridable (see host config). */
export declare const HOST_DEFAULTS: {
    /** Per-level listing cap. */
    readonly maxEntriesPerListing: 2000;
    /** git log -n cap. */
    readonly maxLogEntries: 100;
    /** git status entry cap. */
    readonly maxStatusEntries: 20000;
    /** Reject implausibly long payload paths before touching the filesystem. */
    readonly maxRequestPathLength: 4096;
    /** Cumulative name+path byte budget for one listing. */
    readonly totalListingPathBytes: number;
    /** Per-request cap on stamp-polled directories (loaded/expanded dirs). */
    readonly maxStampDirs: 128;
    /** Read-cap on a single file's text content (the open-file editor); larger files truncate. */
    readonly maxReadBytes: number;
};
export declare function isExplorerListRequest(v: unknown): v is ExplorerListRequest;
export declare function isExplorerStampRequest(v: unknown): v is ExplorerStampRequest;
export declare function isExplorerReadRequest(v: unknown): v is ExplorerReadRequest;
export declare function isGitStatusRequest(v: unknown): v is GitStatusRequest;
export declare function isGitCommitDetailRequest(v: unknown): v is GitCommitDetailRequest;
export declare function isGitStageRequest(v: unknown): v is GitStageRequest;
export declare function isGitDiscardRequest(v: unknown): v is GitDiscardRequest;
export declare function isGitCommitRequest(v: unknown): v is GitCommitRequest;
export declare function isGitLogRequest(v: unknown): v is GitLogRequest;
export declare function isGitDiffRequest(v: unknown): v is GitDiffRequest;
export declare function isGitCommitFileDiffRequest(v: unknown): v is GitCommitFileDiffRequest;
export declare function isSkillListRequest(v: unknown): v is SkillListRequest;
//# sourceMappingURL=rpc.d.ts.map