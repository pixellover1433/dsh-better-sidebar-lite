/**
 * GitRunner (D6 §5.1-5.2): the single git subprocess wrapper. Uses spawn (so
 * an optional stdin payload such as a commit message can be written) with
 * fixed args, no shell, cwd + env seams, config timeout plus cooperative
 * external-signal abort. Errors are classified into a closed kind union
 * (git-missing / timeout / not-a-repo / cancelled / git-failed).
 */
import { spawn } from 'node:child_process';
/** Cap surfaced stderr so secrets or overwhelming output never reach the UI. */
export const STDERR_TAIL = 2048;
function tail(text) {
    return text.length <= STDERR_TAIL ? text : text.slice(-STDERR_TAIL);
}
function isAbortError(err) {
    return err?.name === 'AbortError';
}
function isExitError(err) {
    return typeof err.code === 'number';
}
export class GitRunner {
    executable;
    timeout;
    env;
    constructor(opts) {
        this.executable = opts.executable ?? 'git';
        this.timeout = opts.timeoutMs;
        this.env = opts.env ?? (() => ({ ...process.env }));
    }
    /**
     * Run git with a fixed arg list in cwd, optionally passing `input` on stdin
     * (e.g. git commit -F -). An external abort wins over an in-flight timeout;
     * both behave cooperatively. Never rejects: failures are classified.
     */
    run(args, cwd, signal, input) {
        return new Promise((resolve) => {
            if (signal?.aborted === true) {
                resolve({ ok: false, kind: 'cancelled', message: 'cancelled before start' });
                return;
            }
            let externalAborted = false;
            const child = spawn(this.executable, args, {
                cwd,
                env: this.env(),
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            // Timeout: kill the child; the close handler classifies the kill as a
            // timeout (externalAborted stays false so the kill is not "cancelled").
            // The interval is read at run time so a live-edited setting applies to
            // the next command without a restart.
            const timeoutMs = typeof this.timeout === 'function' ? this.timeout() : this.timeout;
            const timer = setTimeout(() => { child.kill(); }, timeoutMs);
            const chunks = [];
            const errChunks = [];
            child.stdout.on('data', (c) => { chunks.push(c); });
            child.stderr.on('data', (c) => { errChunks.push(c); });
            const abortHandler = () => { externalAborted = true; child.kill(); };
            signal?.addEventListener('abort', abortHandler, { once: true });
            child.on('error', (err) => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', abortHandler);
                resolve(this.classify(err, Buffer.concat(errChunks).toString('utf8'), externalAborted));
            });
            child.on('close', (code, signalStr) => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', abortHandler);
                const stderrText = Buffer.concat(errChunks).toString('utf8');
                if (code === 0) {
                    resolve({ ok: true, stdout: Buffer.concat(chunks), stderr: stderrText });
                    return;
                }
                let err;
                if (externalAborted || signal?.aborted === true) {
                    err = Object.assign(new Error('cancelled'), { name: 'AbortError' });
                }
                else if (signalStr !== null) {
                    err = Object.assign(new Error('killed by signal ' + signalStr), { killed: true });
                }
                else {
                    err = Object.assign(new Error('git exited with code ' + code), { code });
                }
                resolve(this.classify(err, stderrText, externalAborted));
            });
            if (input !== undefined && input.length > 0) {
                child.stdin.write(input);
            }
            child.stdin.end();
        });
    }
    /** Order matters (D6 §5.2): abort, then missing, then timeout, then repo, then generic. */
    classify(err, stderr, externalAborted) {
        if (externalAborted)
            return { ok: false, kind: 'cancelled', message: err.message };
        if (isAbortError(err))
            return { ok: false, kind: 'cancelled', message: err.message };
        if (err.code === 'ENOENT' || err.code === 'EACCES' || /git: not found/i.test(err.message)) {
            return { ok: false, kind: 'git-missing', message: err.message };
        }
        if (err.killed === true || err.code === 'ETIMEDOUT') {
            return { ok: false, kind: 'timeout', message: err.message };
        }
        if (isExitError(err) && /not a git repository/i.test(stderr)) {
            return { ok: false, kind: 'not-a-repo', message: err.message, stderrTail: tail(stderr) };
        }
        return { ok: false, kind: 'git-failed', message: err.message, stderrTail: tail(stderr) };
    }
}
//# sourceMappingURL=git-runner.js.map