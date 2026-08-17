/** Cap surfaced stderr so secrets or overwhelming output never reach the UI. */
export declare const STDERR_TAIL = 2048;
/** A successful run: stdout kept as raw bytes for the caller to parse. */
export interface RunGitOk {
    ok: true;
    stdout: Buffer;
    stderr: string;
}
/**
 * Classified failure. `stderrTail` is present on failures carrying process
 * stderr (git-failed, not-a-repo).
 */
export type RunGitResult = RunGitOk | {
    ok: false;
    kind: 'git-missing' | 'timeout' | 'not-a-repo' | 'cancelled' | 'git-failed';
    message: string;
    stderrTail?: string;
};
export interface GitRunnerOptions {
    /** Executable to invoke (default 'git'); a test may point at a script. */
    executable?: string;
    /**
     * Per-run timeout in ms; expiry => kind timeout. May be a fixed number or a
     * provider read at each run so a user-edited setting (git timeout) takes
     * effect live without restarting the runner.
     */
    timeoutMs: number | (() => number);
    /** Env factory — a single seam so a future security review can narrow it. */
    env?: () => NodeJS.ProcessEnv;
}
export declare class GitRunner {
    private readonly executable;
    private readonly timeout;
    private readonly env;
    constructor(opts: GitRunnerOptions);
    /**
     * Run git with a fixed arg list in cwd, optionally passing `input` on stdin
     * (e.g. git commit -F -). An external abort wins over an in-flight timeout;
     * both behave cooperatively. Never rejects: failures are classified.
     */
    run(args: string[], cwd: string, signal?: AbortSignal, input?: string): Promise<RunGitResult>;
    /** Order matters (D6 §5.2): abort, then missing, then timeout, then repo, then generic. */
    private classify;
}
//# sourceMappingURL=git-runner.d.ts.map