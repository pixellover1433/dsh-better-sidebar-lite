/** Endpoint names (also the wire method segment after the channel). */
export const Endpoints = {
    explorerList: 'explorer/list',
    explorerStamp: 'explorer/stamp',
    explorerRead: 'explorer/read',
    gitStatus: 'git/status',
    gitLog: 'git/log',
    gitStage: 'git/stage',
    gitUnstage: 'git/unstage',
    gitCommitDetail: 'git/commit-detail',
    gitCommit: 'git/commit',
    gitDiscard: 'git/discard',
    gitDiff: 'git/diff',
    gitCommitFileDiff: 'git/commit-file-diff',
    skillsList: 'skills/list',
};
/** Host-side defaults; all are config-overridable (see host config). */
export const HOST_DEFAULTS = {
    /** Per-level listing cap. */
    maxEntriesPerListing: 2000,
    /** git log -n cap. */
    maxLogEntries: 100,
    /** git status entry cap. */
    maxStatusEntries: 20_000,
    /** Reject implausibly long payload paths before touching the filesystem. */
    maxRequestPathLength: 4096,
    /** Cumulative name+path byte budget for one listing. */
    totalListingPathBytes: 1024 * 1024,
    /** Per-request cap on stamp-polled directories (loaded/expanded dirs). */
    maxStampDirs: 128,
    /** Read-cap on a single file's text content (the open-file editor); larger files truncate. */
    maxReadBytes: 4 * 1024 * 1024,
};
function isRecord(v) {
    return typeof v === 'object' && v !== null;
}
function isPath(v) {
    return typeof v === 'string' && v.length > 0 && v.length <= HOST_DEFAULTS.maxRequestPathLength;
}
export function isExplorerListRequest(v) {
    return isRecord(v) && isPath(v.path);
}
export function isExplorerStampRequest(v) {
    if (!isRecord(v) || !isPath(v.path))
        return false;
    if (!Array.isArray(v.dirs) || v.dirs.length === 0 || v.dirs.length > HOST_DEFAULTS.maxStampDirs)
        return false;
    return v.dirs.every(isPath);
}
export function isExplorerReadRequest(v) {
    return isRecord(v) && isPath(v.path);
}
export function isGitStatusRequest(v) {
    return isRecord(v) && isPath(v.path);
}
export function isGitCommitDetailRequest(v) {
    if (!isRecord(v) || !isPath(v.path))
        return false;
    return typeof v.hash === 'string' && /^[0-9a-f]{4,64}$/i.test(v.hash);
}
/**
 * Path-safety check for a single repo-relative file path (no leading slash,
 * no traversal). Shared by the file-list guards and the single-file diff guard.
 */
function isSafeFile(v) {
    return typeof v === 'string' && v.length > 0 && v.length <= 1024 && !v.startsWith('/') && v !== '..' && !v.includes('../');
}
/**
 * Helper shared by stage/unstage-style and discard payloads: a non-empty file
 * list of safe repo-relative paths (no leading slash, no traversal). Empty
 * lists are rejected — prefer an explicit no-op over a footgun.
 */
function isSafeFileList(v) {
    if (!Array.isArray(v) || v.length === 0 || v.length > 1000)
        return false;
    return v.every(isSafeFile);
}
export function isGitStageRequest(v) {
    return isRecord(v) && isPath(v.path) && isSafeFileList(v.files);
}
export function isGitDiscardRequest(v) {
    return isRecord(v) && isPath(v.path) && isSafeFileList(v.files);
}
export function isGitCommitRequest(v) {
    if (!isRecord(v) || !isPath(v.path))
        return false;
    if (typeof v.message !== 'string')
        return false;
    const message = v.message.trim();
    if (message.length === 0)
        return false;
    // Cap the commit-message size so a bloated payload cannot exhaust memory.
    if (message.length > 32 * 1024)
        return false;
    // files optional AND an empty array are fine (commit what's already staged;
    // only the "include all" path lists files). Validate path safety when present.
    if (v.files === undefined)
        return true;
    if (!Array.isArray(v.files) || v.files.length > 1000)
        return false;
    return v.files.every(f => typeof f === 'string' && f.length > 0 && f.length <= 1024 && !f.startsWith('/') && f !== '..' && !f.includes('../'));
}
export function isGitLogRequest(v) {
    if (!isRecord(v) || !isPath(v.path))
        return false;
    if (v.limit === undefined)
        return true;
    return typeof v.limit === 'number' && Number.isInteger(v.limit) && v.limit >= 1 && v.limit <= HOST_DEFAULTS.maxLogEntries;
}
export function isGitDiffRequest(v) {
    return isRecord(v) && isPath(v.path) && isSafeFile(v.file)
        && (v.base === 'index' || v.base === 'head');
}
export function isGitCommitFileDiffRequest(v) {
    if (!isRecord(v) || !isPath(v.path) || !isSafeFile(v.file))
        return false;
    return typeof v.hash === 'string' && /^[0-9a-f]{4,64}$/i.test(v.hash);
}
export function isSkillListRequest(v) {
    return v === undefined || (isRecord(v) && Object.keys(v).length === 0);
}
//# sourceMappingURL=rpc.js.map