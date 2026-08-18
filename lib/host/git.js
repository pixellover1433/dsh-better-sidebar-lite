/**
 * GitService (D6 §5.5): status/log orchestration plus stage/unstage over the
 * GitRunner. Every public method returns a SidebarResult, never throws. The
 * runner classification is translated to the contract's typed error union.
 */
import { sidebarError, } from "../contract/index.js";
import { parsePorcelainV1Z } from "./git-status-parser.js";
/** Translate a classified runner failure into a SidebarError.
 * @param root - the work-tree root the failed command ran in (carried on not-a-repo). */
function mapRunnerError(res, root) {
    switch (res.kind) {
        case 'git-missing': return sidebarError('git-missing', res.message);
        case 'timeout': return sidebarError('timeout', res.message);
        case 'cancelled': return sidebarError('cancelled', res.message);
        case 'not-a-repo': return { code: 'not-a-repo', message: res.message, path: root };
        case 'git-failed': return { code: 'git-failed', message: res.message, stderrTail: res.stderrTail ?? '' };
    }
}
export class GitService {
    runner;
    opts;
    constructor(runner, opts) {
        this.runner = runner;
        this.opts = opts;
    }
    /**
     * Probe the repo: gate not-a-repo and yield the current branch head.
     * Runs rev-parse in `cwd`; git walks up to the worktree root.
     */
    async probe(cwd, signal) {
        const inside = await this.runner.run(['rev-parse', '--is-inside-work-tree'], cwd, signal);
        if (!inside.ok)
            return mapRunnerError(inside, cwd);
        if (inside.stdout.toString('utf8').trim() !== 'true') {
            return { code: 'not-a-repo', message: 'not a git repository', path: cwd };
        }
        const head = await this.runner.run(['rev-parse', '--abbrev-ref', 'HEAD'], cwd, signal);
        if (!head.ok)
            return mapRunnerError(head, cwd);
        const branch = head.stdout.toString('utf8').trim();
        return { ok: true, head: branch === 'HEAD' ? undefined : branch };
    }
    status(request, signal) {
        return this.withProbe(request.path, signal, async (head) => {
            const mode = this.opts.untrackedFiles === 'normal' ? 'normal' : 'all';
            const res = await this.runner.run(['status', '--porcelain=v1', '-z', '--untracked-files=' + mode], request.path, signal);
            if (!res.ok)
                return { ok: false, error: mapRunnerError(res, request.path) };
            const parsed = parsePorcelainV1Z(res.stdout);
            const truncated = parsed.length > this.opts.maxStatusEntries;
            const kept = truncated ? parsed.slice(0, this.opts.maxStatusEntries) : parsed;
            return { ok: true, value: { ...this.group(kept), ...(head === undefined ? {} : { head }), truncated } };
        });
    }
    log(request, signal) {
        return this.withProbe(request.path, signal, async (head) => {
            const cap = request.limit === undefined
                ? this.opts.maxLogEntries
                : Math.min(Math.max(1, request.limit), this.opts.maxLogEntries);
            // Request one extra commit to learn whether more exist beyond the page.
            const res = await this.runner.run(['log', '-n', String(cap + 1), '--format=%H%x1f%h%x1f%an%x1f%ae%x1f%aI%x1f%s%x1e'], request.path, signal);
            if (!res.ok)
                return { ok: false, error: mapRunnerError(res, request.path) };
            const parsed = this.parseLog(res.stdout);
            const truncated = parsed.length > cap;
            const kept = truncated ? parsed.slice(0, cap) : parsed;
            return { ok: true, value: { entries: kept, ...(head === undefined ? {} : { head }), truncated } };
        });
    }
    commitDetail(request, signal) {
        return this.withProbe(request.path, signal, async () => {
            const [messageRes, filesRes] = await Promise.all([
                this.runner.run(['log', '-1', '--format=%B', request.hash], request.path, signal),
                this.runner.run(['diff-tree', '--no-commit-id', '--name-status', '-r', '-M', '-m', '--first-parent', '--root', '-z', request.hash], request.path, signal),
            ]);
            if (!messageRes.ok)
                return { ok: false, error: mapRunnerError(messageRes, request.path) };
            if (!filesRes.ok)
                return { ok: false, error: mapRunnerError(filesRes, request.path) };
            return {
                ok: true,
                value: {
                    message: messageRes.stdout.toString('utf8').replace(/\s+$/, ''),
                    files: parseNameStatus(filesRes.stdout),
                },
            };
        });
    }
    /**
     * Diff a single changed file against its base. `git diff` (base 'index')
     * compares the working tree to the index; `git diff --cached` (base 'head')
     * compares the index to HEAD. Untracked files have no tracked base, so the
     * git tab never routes them here — the editor shows the full file instead.
     */
    diff(request, signal) {
        return this.withProbe(request.path, signal, async () => {
            const args = request.base === 'head'
                ? ['diff', '--cached', '--', request.file]
                : ['diff', '--', request.file];
            const res = await this.runner.run(args, request.path, signal);
            if (!res.ok)
                return { ok: false, error: mapRunnerError(res, request.path) };
            const diff = res.stdout.toString('utf8');
            return { ok: true, value: { diff, empty: diff.length === 0 } };
        });
    }
    /**
     * Diff a single file as introduced by an OLD commit (git show <hash> -- <file>).
     * The diff is computed against the commit's parent(s) straight from the repo
     * object database, so it reflects history rather than the current working
     * tree and works even when the file's working-tree copy has since changed or
     * been deleted. For a root commit this diffs against the empty tree.
     */
    commitFileDiff(request, signal) {
        return this.withProbe(request.path, signal, async () => {
            const res = await this.runner.run(['show', request.hash, '--', request.file], request.path, signal);
            if (!res.ok)
                return { ok: false, error: mapRunnerError(res, request.path) };
            const diff = res.stdout.toString('utf8');
            return { ok: true, value: { diff, empty: diff.length === 0 } };
        });
    }
    stage(request, signal) {
        return this.applyToFiles(request, ['add', '--', ...request.files], signal);
    }
    unstage(request, signal) {
        return this.applyToFiles(request, ['restore', '--staged', '--', ...request.files], signal);
    }
    /**
     * Discard working-tree changes: restore tracked files from HEAD and remove
     * untracked paths (git clean). Splitting avoids discarding a tracked file
     * as untracked; a mix produces up to two commands.
     */
    async discard(request, signal) {
        if (signal?.aborted === true)
            return { ok: false, error: sidebarError('cancelled', 'cancelled') };
        const status = await this.status({ path: request.path }, signal);
        if (!status.ok)
            return status;
        const untrackedSet = new Set(status.value.untracked.map(e => e.path));
        const tracked = request.files.filter(f => !untrackedSet.has(f));
        const untrackedFiles = request.files.filter(f => untrackedSet.has(f));
        const runs = [];
        if (tracked.length > 0) {
            runs.push(this.applyToFiles({ path: request.path, files: tracked }, ['restore', '--worktree', '--', ...tracked], signal));
        }
        if (untrackedFiles.length > 0) {
            runs.push(this.applyToFiles({ path: request.path, files: untrackedFiles }, ['clean', '--force', '--', ...untrackedFiles], signal));
        }
        if (runs.length === 0)
            return { ok: true, value: null };
        const results = await Promise.all(runs);
        const firstFail = results.find(r => !r.ok);
        if (firstFail !== undefined)
            return firstFail;
        return { ok: true, value: null };
    }
    /**
     * Create a commit. Optionally stage `files` first (untracked + unstaged the
     * user chose to include), then commit the index with the message written to
     * git via stdin (-F -) so it never crosses argv or the shell.
     */
    async commit(request, signal) {
        if (signal?.aborted === true)
            return { ok: false, error: sidebarError('cancelled', 'cancelled') };
        return this.withProbe(request.path, signal, async () => {
            if (request.files.length > 0) {
                const add = await this.runner.run(['add', '--', ...request.files], request.path, signal);
                if (!add.ok)
                    return { ok: false, error: mapRunnerError(add, request.path) };
            }
            const message = request.message.trim();
            const commit = await this.runner.run(['commit', '-F', '-'], request.path, signal, message);
            if (!commit.ok)
                return { ok: false, error: mapRunnerError(commit, request.path) };
            const hashRes = await this.runner.run(['rev-parse', 'HEAD'], request.path, signal);
            if (!hashRes.ok)
                return { ok: false, error: mapRunnerError(hashRes, request.path) };
            const hash = hashRes.stdout.toString('utf8').trim();
            return { ok: true, value: { hash } };
        });
    }
    /** Run a probe, then a body that produces a typed result. */
    async withProbe(cwd, signal, body) {
        const probe = await this.probe(cwd, signal);
        if ('ok' in probe)
            return body(probe.head);
        return { ok: false, error: probe };
    }
    /** stage/unstage run a single fixed git command; failures map to errors. */
    async applyToFiles(request, args, signal) {
        if (signal?.aborted === true)
            return { ok: false, error: sidebarError('cancelled', 'cancelled') };
        const res = await this.runner.run(args, request.path, signal);
        if (!res.ok)
            return { ok: false, error: mapRunnerError(res, request.path) };
        return { ok: true, value: null };
    }
    group(entries) {
        const staged = entries.filter(e => e.staged);
        const unstaged = entries.filter(e => e.unstaged);
        const untracked = entries.filter(e => e.untracked);
        const conflicted = entries.filter(e => e.conflicted);
        return { staged, unstaged, untracked, conflicted };
    }
    /** Parse log records (fields 0x1f, records 0x1e). A subject containing the separator drops that record. */
    parseLog(stdout) {
        const text = stdout.toString('utf8');
        if (text.length === 0)
            return [];
        const out = [];
        for (const record of text.split('\x1e')) {
            if (record.length === 0)
                continue;
            const fields = record.split('\x1f');
            const [hash, shortHash, authorName, authorEmail, authoredAtISO, subject] = fields;
            if (hash === undefined || shortHash === undefined || authorName === undefined
                || authorEmail === undefined || authoredAtISO === undefined || subject === undefined)
                continue;
            out.push({ hash, shortHash, authorName, authorEmail, authoredAtISO, subject });
        }
        return out;
    }
}
/**
 * Parse `git diff-tree --name-status -z` output into per-file records.
 * With -z every FIELD is its own NUL record: 'M<NUL>path<NUL>' and
 * 'R100<NUL>old<NUL>new<NUL>' (rename source FIRST, unlike porcelain
 * status -z). -z disables C-quoting, so paths with spaces parse verbatim.
 */
export function parseNameStatus(stdout) {
    const text = stdout.toString('utf8');
    if (text.length === 0)
        return [];
    const records = text.split('\0');
    const files = [];
    let i = 0;
    while (i < records.length) {
        const statusField = records[i];
        if (statusField === undefined || statusField.length === 0) {
            i += 1;
            continue;
        }
        const letter = statusField[0];
        if (letter === 'R' || letter === 'C') {
            const original = records[i + 1];
            const target = records[i + 2];
            if (original === undefined || original === '' || target === undefined || target === '')
                break;
            const file = { status: letter, path: target, originalPath: original };
            const score = Number(statusField.slice(1));
            if (!Number.isNaN(score))
                file.score = score;
            files.push(file);
            i += 3;
        }
        else {
            const p = records[i + 1];
            if (p === undefined || p === '')
                break;
            files.push({ status: letter, path: p });
            i += 2;
        }
    }
    return files;
}
//# sourceMappingURL=git.js.map