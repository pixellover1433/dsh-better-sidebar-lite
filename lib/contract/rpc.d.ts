/**
 * Endpoint table, request/response maps, payload guards, and shared caps
 * (ADR-002). Hand-rolled type-predicate guards keep the contract
 * dependency-free and usable on both halves.
 */
import type { ExplorerListRequest, ExplorerListResult } from './explorer.ts';
import type { GitCommitDetailRequest, GitCommitDetailResult, GitCommitRequest, GitCommitResult, GitDiscardRequest, GitLogRequest, GitLogResult, GitStageRequest, GitStatusRequest, GitStatusResult } from './git.ts';
/** Endpoint names (also the wire method segment after the channel). */
export declare const Endpoints: {
    readonly explorerList: "explorer/list";
    readonly gitStatus: "git/status";
    readonly gitLog: "git/log";
    readonly gitStage: "git/stage";
    readonly gitUnstage: "git/unstage";
    readonly gitCommitDetail: "git/commit-detail";
    readonly gitCommit: "git/commit";
    readonly gitDiscard: "git/discard";
};
export type BetterSidebarEndpoint = typeof Endpoints[keyof typeof Endpoints];
/** Request payload per endpoint. */
export interface BetterSidebarReqMap {
    'explorer/list': ExplorerListRequest;
    'git/status': GitStatusRequest;
    'git/log': GitLogRequest;
    'git/stage': GitStageRequest;
    'git/unstage': GitStageRequest;
    'git/commit-detail': GitCommitDetailRequest;
    'git/commit': GitCommitRequest;
    'git/discard': GitDiscardRequest;
}
/** Success value per endpoint. */
export interface BetterSidebarResMap {
    'explorer/list': ExplorerListResult;
    'git/status': GitStatusResult;
    'git/log': GitLogResult;
    'git/stage': null;
    'git/unstage': null;
    'git/commit-detail': GitCommitDetailResult;
    'git/commit': GitCommitResult;
    'git/discard': null;
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
};
export declare function isExplorerListRequest(v: unknown): v is ExplorerListRequest;
export declare function isGitStatusRequest(v: unknown): v is GitStatusRequest;
export declare function isGitCommitDetailRequest(v: unknown): v is GitCommitDetailRequest;
export declare function isGitStageRequest(v: unknown): v is GitStageRequest;
export declare function isGitDiscardRequest(v: unknown): v is GitDiscardRequest;
export declare function isGitCommitRequest(v: unknown): v is GitCommitRequest;
export declare function isGitLogRequest(v: unknown): v is GitLogRequest;
//# sourceMappingURL=rpc.d.ts.map