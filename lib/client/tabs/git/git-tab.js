import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * Git tab panel (ADR-004): resolves the workspace root, owns the status/log
 * fetch state with supersede-on-refresh cancellation, and routes errors to the
 * four decided surfaces — not-a-repo (full-tab empty state), git-missing
 * (full-tab error), timeout/other (inline banner + retry), and no-workspace
 * (full-tab hint). Last-good data is preserved across a failed refresh so the
 * shell is never blanked.
 *
 * Auto-refresh (ADR-004 §3 amendment): hybrid of a session dirty-signal and a
 * visibility-scoped fallback poll. The dirty-signal reacts within a debounce
 * whenever the active session's updatedAt bumps (message/tool frames land —
 * e.g. a write/edit tool changed the working tree); the poll catches changes
 * that never touch the session store (IDE, terminal, other processes). Both
 * run only while the tab is mounted (active tab + open dock) and the document
 * is visible, and both refresh status first, following with the log only when
 * the status actually changed. A refresh is a manual override at any time.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Endpoints } from "../../../contract/rpc.js";
import { useDock } from "../../dock/context.js";
import { resolveRoot } from "../../workspace-root.js";
import { GitBranchIcon, RefreshIcon } from "../../icons.js";
import { useBetterSidebarSettings } from "../shared/settings.js";
import { GitStatusView } from "./status-view.js";
import { GitLogView } from "./log-view.js";
import { CommitDetailView } from "./commit-detail-view.js";
import styles from './git.module.css';
/** Page size used by the initial log request and incremented by "Load more". */
const GIT_LOG_PAGE_SIZE = 50;
/** Fallback poll cadence default (status-only; the log follows a status change). */
export const AUTO_REFRESH_STATUS_INTERVAL_MS = 8_000;
/**
 * Debounce default for session-activity-triggered auto-refresh. Session frames
 * (and their updatedAt bumps) arrive in bursts around one tool run.
 */
export const AUTO_REFRESH_DEBOUNCE_MS = 600;
/** Full-tab fallback state (never a blank shell). */
function FullTabState({ title, hint, path, t, action }) {
    return (_jsx("div", { className: styles.panel, children: _jsxs("div", { className: styles.state, children: [_jsx("div", { className: styles.stateTitle, children: title }), _jsx("div", { className: styles.stateHint, children: hint }), path !== undefined && _jsx("div", { className: styles.statePath, children: path }), action !== undefined && (_jsx("button", { type: "button", className: styles.stateAction, onClick: action, children: t('errorRetry') }))] }) }));
}
/** Inline transient-error banner with a retry affordance. */
function ErrorBanner({ message, t, onRetry }) {
    return (_jsxs("div", { className: styles.banner, role: "alert", children: [_jsx("span", { children: message }), _jsx("button", { type: "button", className: styles.retryButton, onClick: onRetry, children: t('errorRetry') })] }));
}
/** Commit composer: message textarea + commit button + "include all" toggle. */
function CommitComposer({ result, root, rpc, t, onCommitted, onActionError }) {
    const [message, setMessage] = useState('');
    const [includeAll, setIncludeAll] = useState(false);
    const [busy, setBusy] = useState(false);
    const onChangeCount = result.staged.length;
    const allChangeCount = result.staged.length + result.unstaged.length + result.untracked.length;
    const canCommit = message.trim().length > 0 && (includeAll ? allChangeCount > 0 : onChangeCount > 0) && !busy;
    const doCommit = async () => {
        if (!canCommit)
            return;
        setBusy(true);
        let files = [];
        if (includeAll) {
            files = [
                ...result.staged.map(e => e.path),
                ...result.unstaged.map(e => e.path),
                ...result.untracked.map(e => e.path),
            ];
        }
        const res = await rpc.call(Endpoints.gitCommit, { path: root, message, files });
        setBusy(false);
        if (!res.ok) {
            onActionError(res.error.message);
            return;
        }
        setMessage('');
        setIncludeAll(false);
        onCommitted();
    };
    return (_jsxs("div", { className: styles.composer, children: [_jsx("textarea", { className: styles.composerInput, value: message, onChange: (e) => setMessage(e.target.value), placeholder: t('commitPlaceholder'), "aria-label": t('commitMessage'), disabled: busy }), _jsxs("label", { className: styles.composerRow, children: [_jsx("input", { type: "checkbox", checked: includeAll, onChange: (e) => setIncludeAll(e.target.checked), disabled: busy }), _jsx("span", { children: t('commitAll') })] }), _jsx("button", { type: "button", className: styles.commitButton, onClick: () => void doCommit(), disabled: !canCommit, children: t('commit') })] }));
}
export function GitTab({ rpc, emitter, t }) {
    const { useSessions, useWorkspaces, settings } = useDock();
    const sessions = useSessions(s => s);
    const workspaces = useWorkspaces(w => w);
    const root = resolveRoot(sessions, workspaces);
    const { gitPollMs, gitDebounceMs } = useBetterSidebarSettings(settings);
    const [statusValue, setStatusValue] = useState(null);
    const [logValue, setLogValue] = useState(null);
    const [statusError, setStatusError] = useState(null);
    const [logError, setLogError] = useState(null);
    /** Transient banner for failed stage/unstage actions (S4). */
    const [actionError, setActionError] = useState(null);
    /** Commit whose changed files are shown; null = log list. */
    const [selectedCommit, setSelectedCommit] = useState(null);
    /** Commit-files fetch state (aborted/superseded like the refresh pair). */
    const [commitDetail, setCommitDetail] = useState({ kind: 'loading' });
    const commitDetailCtrl = useRef(null);
    const [loading, setLoading] = useState(true);
    const [logLimit, setLogLimit] = useState(GIT_LOG_PAGE_SIZE);
    // logLimit is read by the stable refresh callback, so it rides a ref too.
    const logLimitRef = useRef(logLimit);
    const setPage = useCallback((next) => {
        logLimitRef.current = next;
        setLogLimit(next);
    }, []);
    // Latest status result mirrored in a ref so the stable auto-refresh callback
    // can diff against it without re-creating itself on every state change.
    const statusRef = useRef(null);
    const applyStatus = useCallback((next) => {
        statusRef.current = next;
        setStatusValue(next);
    }, []);
    const controllerRef = useRef(null);
    /** Abort any superseded request and open a fresh controller for this one. */
    const nextController = useCallback(() => {
        controllerRef.current?.abort();
        const ctrl = new AbortController();
        controllerRef.current = ctrl;
        return ctrl;
    }, []);
    /** Full refresh: git/status + git/log in parallel; aborts any in-flight pair. */
    const refresh = useCallback(() => {
        if (root === undefined)
            return;
        const ctrl = nextController();
        const signal = ctrl.signal;
        const limit = logLimitRef.current;
        setLoading(true);
        void (async () => {
            const [s, l] = await Promise.all([
                rpc.call(Endpoints.gitStatus, { path: root }, { signal }),
                rpc.call(Endpoints.gitLog, { path: root, limit }, { signal }),
            ]);
            if (signal.aborted)
                return;
            if (s.ok) {
                applyStatus(s.value);
                setStatusError(null);
            }
            else
                setStatusError(s.error);
            if (l.ok) {
                setLogValue(l.value);
                setLogError(null);
            }
            else
                setLogError(l.error);
            setLoading(false);
        })();
    }, [rpc, root, nextController, applyStatus]);
    /** Status-only refresh used after a stage/unstage mutation. */
    const refreshStatus = useCallback(() => {
        if (root === undefined)
            return;
        const ctrl = nextController();
        const signal = ctrl.signal;
        void (async () => {
            const res = await rpc.call(Endpoints.gitStatus, { path: root }, { signal });
            if (signal.aborted)
                return;
            if (res.ok) {
                applyStatus(res.value);
                setStatusError(null);
            }
            else
                setStatusError(res.error);
        })();
    }, [rpc, root, nextController, applyStatus]);
    /** Discard a single file's working-tree changes (restore/clean). */
    const discard = useCallback(async (entry) => {
        if (root === undefined)
            return;
        // A destructive action warrants confirmation.
        const ok = window.confirm(t('discardConfirm').replace('{path}', entry.path));
        if (!ok)
            return;
        const res = await rpc.call(Endpoints.gitDiscard, { path: root, files: [entry.path] });
        if (res.ok) {
            refreshStatus();
            return;
        }
        setActionError(res.error.message);
    }, [rpc, root, refreshStatus, t]);
    /** Discard all unstaged + untracked changes. */
    const discardAll = useCallback(async () => {
        if (root === undefined || statusValue === null)
            return;
        const paths = [...statusValue.unstaged.map(e => e.path), ...statusValue.untracked.map(e => e.path)];
        if (paths.length === 0)
            return;
        if (!window.confirm(t('discardAllConfirm')))
            return;
        const res = await rpc.call(Endpoints.gitDiscard, { path: root, files: paths });
        if (res.ok) {
            refreshStatus();
            return;
        }
        setActionError(res.error.message);
    }, [rpc, root, statusValue, refreshStatus, t]);
    /** Full refresh (status + log) used after a commit so the log updates. */
    const refreshAll = useCallback(() => {
        if (root === undefined)
            return;
        const ctrl = nextController();
        const signal = ctrl.signal;
        const limit = logLimitRef.current;
        void (async () => {
            const [s, l] = await Promise.all([
                rpc.call(Endpoints.gitStatus, { path: root }, { signal }),
                rpc.call(Endpoints.gitLog, { path: root, limit }, { signal }),
            ]);
            if (signal.aborted)
                return;
            if (s.ok) {
                applyStatus(s.value);
                setStatusError(null);
            }
            else
                setStatusError(s.error);
            if (l.ok) {
                setLogValue(l.value);
                setLogError(null);
            }
            else
                setLogError(l.error);
        })();
    }, [rpc, root, nextController, applyStatus]);
    // ---- Auto-refresh (ADR-004 §3 amendment): dirty-signal + fallback poll ----
    /**
     * Auto-refresh body: status first, then the log only when the status
     * actually changed. Never sets the loading state (last-good stays on
     * screen), supersedes any in-flight pair like a manual refresh, and is a
     * no-op without a root or while the document is hidden.
     */
    const autoRefresh = useCallback(() => {
        if (root === undefined || document.hidden)
            return;
        const ctrl = nextController();
        const signal = ctrl.signal;
        void (async () => {
            const res = await rpc.call(Endpoints.gitStatus, { path: root }, { signal });
            if (signal.aborted)
                return;
            if (!res.ok) {
                setStatusError(res.error);
                return;
            }
            const prev = statusRef.current;
            applyStatus(res.value);
            setStatusError(null);
            // The working tree moved (or the first auto-refresh has no baseline):
            // bring the log up to date too (new commits, branch moves).
            if (prev === null || JSON.stringify(prev) !== JSON.stringify(res.value)) {
                const limit = logLimitRef.current;
                const l = await rpc.call(Endpoints.gitLog, { path: root, limit }, { signal });
                if (signal.aborted)
                    return;
                if (l.ok) {
                    setLogValue(l.value);
                    setLogError(null);
                }
                else
                    setLogError(l.error);
            }
        })();
    }, [rpc, root, nextController, applyStatus]);
    const autoRefreshTimerRef = useRef(null);
    // Debounce read at fire time so a live settings edit applies without
    // re-creating the stable auto-refresh callback on every render.
    const debounceMsRef = useRef(gitDebounceMs);
    debounceMsRef.current = gitDebounceMs;
    /** Debounced auto-refresh: session frames arrive in bursts, coalesce them. */
    const scheduleAutoRefresh = useCallback(() => {
        if (autoRefreshTimerRef.current !== null)
            window.clearTimeout(autoRefreshTimerRef.current);
        autoRefreshTimerRef.current = window.setTimeout(() => {
            autoRefreshTimerRef.current = null;
            void autoRefresh();
        }, debounceMsRef.current);
    }, [autoRefresh]);
    /** Last observed activity stamp of the active session (dirty-signal). */
    const lastActivityRef = useRef({ sessionId: undefined, updatedAt: 0 });
    /** First observation only seeds the stamp; it never triggers a refresh. */
    const activitySeededRef = useRef(false);
    /** Open a commit: show its changed files; supersedes any in-flight fetch. */
    const openCommit = useCallback((entry) => {
        if (root === undefined)
            return;
        setSelectedCommit(entry);
        setCommitDetail({ kind: 'loading' });
        commitDetailCtrl.current?.abort();
        const ctrl = new AbortController();
        commitDetailCtrl.current = ctrl;
        void (async () => {
            const res = await rpc.call(Endpoints.gitCommitDetail, { path: root, hash: entry.hash.trim() }, { signal: ctrl.signal });
            if (ctrl.signal.aborted)
                return;
            if (res.ok)
                setCommitDetail({ kind: 'loaded', result: res.value });
            else
                setCommitDetail({ kind: 'error', message: res.error.message });
        })();
    }, [rpc, root]);
    /** Return to the log list. */
    const closeCommit = useCallback(() => {
        commitDetailCtrl.current?.abort();
        setSelectedCommit(null);
    }, []);
    /**
     * Open a changed file's diff for the selected old commit (double-click).
     * Diff against the file's new-side path (`file.path`), which for a rename
     * (R) or copy (C) is the destination — the same convention `git show` uses.
     * Emits into the shared emitter so the dock-wide modal renders `kind: 'commit'`.
     */
    const openCommitFile = useCallback((file) => {
        if (root === undefined || selectedCommit === null)
            return;
        const path = root + '/' + file.path;
        const name = file.path.slice(file.path.lastIndexOf('/') + 1);
        emitter.emit({
            path, name, kind: 'file', source: 'double-click', rootPath: root,
            diff: { kind: 'commit', root, hash: selectedCommit.hash.trim(), file: file.path },
        });
    }, [root, selectedCommit, emitter]);
    /** Fetch the next log page (larger limit, replaces the list) when truncated. */
    const loadMore = useCallback(() => {
        if (root === undefined)
            return;
        const next = logLimitRef.current + GIT_LOG_PAGE_SIZE;
        setPage(next);
        const ctrl = nextController();
        const signal = ctrl.signal;
        void (async () => {
            const res = await rpc.call(Endpoints.gitLog, { path: root, limit: next }, { signal });
            if (signal.aborted)
                return;
            if (res.ok) {
                setLogValue(res.value);
                setLogError(null);
            }
            else
                setLogError(res.error);
        })();
    }, [rpc, root, nextController, setPage]);
    // Refresh on mount and whenever the workspace root changes.
    useEffect(() => {
        if (root === undefined)
            return;
        setLoading(true);
        applyStatus(null);
        setStatusError(null);
        setLogValue(null);
        setLogError(null);
        // A pending auto-refresh timer holds a stale-root closure; drop it, and
        // re-seed the activity stamp so the root-change refresh is not doubled by
        // the dirty-signal (this effect runs before the activity effect below).
        if (autoRefreshTimerRef.current !== null) {
            window.clearTimeout(autoRefreshTimerRef.current);
            autoRefreshTimerRef.current = null;
        }
        lastActivityRef.current = { sessionId: undefined, updatedAt: 0 };
        activitySeededRef.current = false;
        void refresh();
    }, [root, refresh, applyStatus]);
    /**
     * Session dirty-signal: the active session's updatedAt bumps whenever the
     * agent lands a message/tool frame (e.g. a write/edit tool that changed the
     * working tree), so that bump is a strong hint to auto-refresh. The first
     * observation seeds the stamp; later bumps schedule a debounced refresh.
     * Runs after every render; the comparison is cheap.
     */
    useEffect(() => {
        const current = sessions.current;
        const summary = current === undefined ? undefined : sessions.byId[current];
        const stamp = { sessionId: current, updatedAt: summary?.updatedAt ?? 0 };
        const prev = lastActivityRef.current;
        lastActivityRef.current = stamp;
        if (!activitySeededRef.current) {
            activitySeededRef.current = true;
            return;
        }
        if (stamp.sessionId === prev.sessionId && stamp.updatedAt === prev.updatedAt)
            return;
        if (root === undefined || document.hidden)
            return;
        scheduleAutoRefresh();
    });
    /**
     * Fallback poll: catches working-tree changes that never touch the session
     * store (IDE, terminal, other processes). Runs only while this tab is
     * mounted — GitTab unmounts when the tab is inactive or the dock collapses —
     * and skips hidden documents. Status-only; the log follows a status change
     * inside autoRefresh.
     */
    useEffect(() => {
        if (root === undefined)
            return;
        const id = window.setInterval(() => {
            void autoRefresh();
        }, gitPollMs);
        return () => window.clearInterval(id);
    }, [root, autoRefresh, gitPollMs]);
    // Abort in-flight requests on unmount.
    useEffect(() => () => {
        controllerRef.current?.abort();
        commitDetailCtrl.current?.abort();
        if (autoRefreshTimerRef.current !== null)
            window.clearTimeout(autoRefreshTimerRef.current);
    }, []);
    if (root === undefined) {
        return _jsx(FullTabState, { title: t('noWorkspace'), hint: t('noWorkspaceHint'), t: t });
    }
    // The git-environment decision is keyed off status.
    if (statusError?.code === 'not-a-repo') {
        return _jsx(FullTabState, { title: t('notARepo'), hint: t('notARepoHint'), path: root, t: t, action: refresh });
    }
    if (statusError?.code === 'git-missing') {
        return _jsx(FullTabState, { title: t('gitMissing'), hint: t('gitMissingHint'), t: t, action: refresh });
    }
    const branch = statusValue?.head ?? logValue?.head;
    const initialLoading = loading && statusValue === null && logValue === null;
    return (_jsxs("div", { className: styles.panel, children: [_jsxs("div", { className: styles.header, children: [_jsxs("span", { className: styles.branch, children: [_jsx(GitBranchIcon, { size: 14 }), _jsx("span", { className: styles.branchName, title: branch, children: branch ?? t('branch') })] }), _jsx("button", { type: "button", className: styles.iconButton, "aria-label": t('refresh'), onClick: refresh, children: _jsx(RefreshIcon, { size: 14 }) })] }), _jsx("div", { className: styles.body, children: initialLoading ? (_jsx("div", { className: styles.loading, children: t('loading') })) : (_jsxs(_Fragment, { children: [statusError !== null && (_jsx(ErrorBanner, { message: statusError.message, t: t, onRetry: refresh })), actionError !== null && _jsx(ErrorBanner, { message: actionError, t: t, onRetry: () => setActionError(null) }), statusValue !== null && (_jsx(GitStatusView, { result: statusValue, root: root, rpc: rpc, emitter: emitter, t: t, onChanged: refreshStatus, onActionError: setActionError, onDiscard: (entry) => { void discard(entry); }, onDiscardAll: () => { void discardAll(); } })), statusValue !== null && (_jsx(CommitComposer, { result: statusValue, root: root, rpc: rpc, t: t, onCommitted: refreshAll, onActionError: setActionError })), logError !== null && _jsx(ErrorBanner, { message: logError.message, t: t, onRetry: refresh }), logValue !== null && selectedCommit !== null && (_jsx("div", { className: styles.logSection, children: _jsx(CommitDetailView, { commit: selectedCommit, state: commitDetail, t: t, onBack: closeCommit, onRetry: () => openCommit(selectedCommit), onOpenFile: openCommitFile }) })), logValue !== null && selectedCommit === null && (_jsx("div", { className: styles.logSection, children: _jsx(GitLogView, { result: logValue, t: t, onLoadMore: loadMore, onSelectCommit: openCommit }) }))] })) })] }));
}
//# sourceMappingURL=git-tab.js.map