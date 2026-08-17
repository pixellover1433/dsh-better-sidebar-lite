import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useDock } from "../../dock/context.js";
import { RefreshIcon } from "../../icons.js";
import { resolveRoot } from "../../workspace-root.js";
import { Endpoints } from "../../../contract/rpc.js";
import { basename, ExplorerStore } from "./state.js";
import { TreeNodeRow } from "./TreeNodeRow.js";
import { useBetterSidebarSettings } from "../shared/settings.js";
import styles from './ExplorerPanel.module.css';
/**
 * Fallback poll cadence default (ADR-004 §3 amendment, explorer): catches
 * tree-visible changes that never touch the session store (IDE, terminal,
 * other processes). Read live from the plugin settings when the seam is
 * composed; this is the fallback when it is not.
 */
export const AUTO_REFRESH_EXPLORER_INTERVAL_MS = 8_000;
/**
 * Debounce default for session-activity-triggered auto-refresh. Session frames
 * (and their updatedAt bumps) arrive in bursts around one tool run. Live
 * settings override this when the seam is composed.
 */
export const AUTO_REFRESH_EXPLORER_DEBOUNCE_MS = 600;
/**
 * Flatten the visible rows depth-first from the root's children. Collapsed
 * directories stop recursion; the ordered list powers ArrowUp/Down/Home/End.
 */
function flattenVisible(state) {
    const rows = [];
    const root = state.root;
    const rootChildren = root === undefined ? undefined : state.nodes[root]?.children;
    if (rootChildren === undefined)
        return rows;
    const walk = (entries, depth) => {
        for (const entry of entries) {
            rows.push({ entry, depth });
            if (entry.kind === 'directory') {
                const n = state.nodes[entry.path];
                if (n?.expanded === true)
                    walk(n.children ?? [], depth + 1);
            }
        }
    };
    walk(rootChildren, 0);
    return rows;
}
/**
 * Explorer tab panel (D2): resolves the workspace root, owns an ExplorerStore,
 * and renders the tree with WebAIM roving-tabindex semantics. The includeHidden
 * toggle is deliberately DEFERRED (the contract shares no hidden flag and the
 * host always filters) — no toggle is rendered.
 */
export function ExplorerPanel({ rpc, emitter, t }) {
    const { useSessions, useWorkspaces, settings } = useDock();
    const sessions = useSessions(s => s);
    const workspaces = useWorkspaces(w => w);
    const { explorerPollMs, explorerDebounceMs } = useBetterSidebarSettings(settings);
    // Store created once per mount over a stable rpc facade; lazy init keeps the
    // loader bound to the injected instances.
    const [store] = useState(() => new ExplorerStore((path, signal) => rpc.call(Endpoints.explorerList, { path }, { signal })));
    const state = useSyncExternalStore(store.subscribe.bind(store), store.snapshot.bind(store));
    const root = useMemo(() => resolveRoot(sessions, workspaces), [sessions, workspaces]);
    // ---- Auto-refresh (ADR-004 §3 amendment, explorer) ----
    /** Change-stamp transport bound to the rpc facade (stable per rpc). */
    const stampLoader = useCallback((request, signal) => rpc.call(Endpoints.explorerStamp, request, { signal }), [rpc]);
    // Last observed activity stamp of the active session (dirty-signal). First
    // observation seeds only; later bumps schedule a debounced refresh.
    const lastActivityRef = useRef({ sessionId: undefined, updatedAt: 0 });
    const activitySeededRef = useRef(false);
    const autoRefreshTimerRef = useRef(null);
    // Debounce read at fire time so a live settings edit applies without the
    // stable auto-refresh callback re-creating itself on every render.
    const debounceMsRef = useRef(explorerDebounceMs);
    debounceMsRef.current = explorerDebounceMs;
    /** Debounced auto-refresh: session frames arrive in bursts, coalesce them. */
    const scheduleAutoRefresh = useCallback(() => {
        if (autoRefreshTimerRef.current !== null)
            window.clearTimeout(autoRefreshTimerRef.current);
        autoRefreshTimerRef.current = window.setTimeout(() => {
            autoRefreshTimerRef.current = null;
            // Session frames landed (e.g. a write/edit tool): refresh every loaded
            // directory silently so anything the agent touched shows up quickly.
            const loaded = Object.values(store.snapshot().nodes)
                .filter(n => n.children !== undefined && n.entry.kind === 'directory')
                .map(n => n.entry.path);
            void store.refreshDirs(loaded);
        }, debounceMsRef.current);
    }, [store]);
    // Root change => full reset + list (ADR-004 root-resolution precedence). A
    // pending auto-refresh timer holds a stale-root closure, so drop it and
    // re-seed the activity stamp — the root change itself already refreshes.
    useEffect(() => {
        store.setRoot(root);
        void store.loadRoot();
        if (autoRefreshTimerRef.current !== null) {
            window.clearTimeout(autoRefreshTimerRef.current);
            autoRefreshTimerRef.current = null;
        }
        lastActivityRef.current = { sessionId: undefined, updatedAt: 0 };
        activitySeededRef.current = false;
    }, [store, root]);
    // Session dirty-signal: the active session's updatedAt bumps whenever the
    // agent lands a message/tool frame (e.g. a write/edit tool that changed the
    // workspace), so that bump is a strong hint to auto-refresh. Runs after
    // every render; the comparison is cheap. Mirrors the git tab.
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
    // Fallback poll: catches changes that never touch the session store (IDE,
    // terminal, other processes). Runs only while this tab is mounted — the
    // panel unmounts when the tab is inactive or the dock collapses — and skips
    // hidden documents. The sweep is a cheap stamp diff; only moved directories
    // are re-listed.
    useEffect(() => {
        if (root === undefined)
            return;
        const id = window.setInterval(() => {
            if (document.hidden)
                return;
            void store.pollStamps(stampLoader);
        }, explorerPollMs);
        return () => window.clearInterval(id);
    }, [root, store, stampLoader, explorerPollMs]);
    // Abort the pending debounce on unmount.
    useEffect(() => () => {
        if (autoRefreshTimerRef.current !== null)
            window.clearTimeout(autoRefreshTimerRef.current);
    }, []);
    // Move real DOM focus to the focused row (roving tabindex).
    const rowEls = useRef(new Map());
    useEffect(() => {
        const el = state.focusedPath === undefined ? undefined : rowEls.current.get(state.focusedPath);
        el?.focus();
    }, [state.focusedPath]);
    const openFile = (row, source) => {
        if (state.root === undefined)
            return;
        emitter.emit({
            path: row.entry.path,
            name: row.entry.name,
            kind: 'file',
            source,
            rootPath: state.root,
        });
    };
    const moveFocusTo = (index) => {
        const rows = flattenVisible(state);
        if (rows.length === 0)
            return;
        const clamped = Math.max(0, Math.min(rows.length - 1, index));
        const target = rows[clamped];
        if (target === undefined)
            return;
        store.focus(target.entry.path);
        store.select(target.entry.path);
    };
    const parentOf = (path) => {
        for (const n of Object.values(state.nodes)) {
            if (n.children?.some(c => c.path === path))
                return n.entry.path;
        }
        return undefined;
    };
    /** Expand the focused node and its direct directory children one level (*). */
    const expandOneLevel = async (path) => {
        await store.expand(path);
        const after = store.snapshot().nodes[path];
        for (const kid of after?.children ?? []) {
            if (kid.kind === 'directory') {
                const kn = store.snapshot().nodes[kid.path];
                if (kn?.expanded !== true)
                    void store.expand(kid.path);
            }
        }
    };
    const onKeyDown = (event) => {
        const focused = state.focusedPath;
        if (focused === undefined)
            return;
        const rows = flattenVisible(state);
        const idx = rows.findIndex(r => r.entry.path === focused);
        if (idx === -1)
            return;
        const row = rows[idx];
        if (row === undefined)
            return;
        const node = state.nodes[focused];
        const dir = row.entry.kind === 'directory';
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                moveFocusTo(idx + 1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                moveFocusTo(idx - 1);
                break;
            case 'ArrowRight':
                event.preventDefault();
                if (dir && node?.expanded !== true) {
                    void store.expand(focused);
                }
                else if (dir && node?.expanded === true && (node.children?.length ?? 0) > 0) {
                    moveFocusTo(idx + 1);
                }
                break;
            case 'ArrowLeft':
                event.preventDefault();
                if (dir && node?.expanded === true) {
                    store.collapse(focused);
                }
                else {
                    const parent = parentOf(focused);
                    if (parent !== undefined)
                        store.focus(parent);
                }
                break;
            case 'Home':
                event.preventDefault();
                moveFocusTo(0);
                break;
            case 'End':
                event.preventDefault();
                moveFocusTo(rows.length - 1);
                break;
            case 'Enter':
            case ' ':
                event.preventDefault();
                if (dir)
                    void store.toggle(focused);
                else
                    openFile(row, 'keyboard-enter');
                break;
            case '*':
                event.preventDefault();
                void expandOneLevel(focused);
                break;
            default:
                // Delete/Backspace and every other key are intentionally unbound.
                break;
        }
    };
    const renderNodes = (entries, depth) => {
        return entries.map(entry => {
            const n = state.nodes[entry.path];
            const dir = entry.kind === 'directory';
            const expanded = dir && n?.expanded === true;
            const loadState = n?.loadState ?? (dir ? 'idle' : 'loaded');
            const selected = entry.path === state.selectedPath;
            const focused = entry.path === state.focusedPath;
            const children = dir && expanded ? (n?.children ?? []) : [];
            return (_jsxs("div", { children: [_jsx(TreeNodeRow, { entry: entry, depth: depth, expanded: expanded, selected: selected, focused: focused, loadState: loadState, retryLabel: t('retry'), expandLabel: t('expand'), collapseLabel: t('collapse'), errorMessage: n?.loadError?.message, onToggle: () => { void store.toggle(entry.path); }, onActivate: () => { store.select(entry.path); store.focus(entry.path); }, onOpen: () => openFile({ entry, depth }, 'double-click'), onRetry: () => { void store.expand(entry.path); }, rowRef: (el) => {
                            if (el)
                                rowEls.current.set(entry.path, el);
                            else
                                rowEls.current.delete(entry.path);
                        } }), children.length > 0 && _jsx("div", { role: "group", children: renderNodes(children, depth + 1) })] }, entry.path));
        });
    };
    return (_jsxs("div", { className: styles.panel, role: "region", "aria-label": "Explorer", children: [_jsxs("div", { className: styles.panelHead, children: [_jsx("span", { className: styles.title, children: t('tabLabel') }), _jsxs("button", { type: "button", className: styles.refresh, onClick: () => { void store.refresh(); }, children: [_jsx(RefreshIcon, { size: 15 }), _jsx("span", { className: styles.srOnly, children: t('refresh') })] })] }), state.surface.phase === 'no-workspace' && (_jsxs("div", { className: styles.surface, children: [_jsx("div", { className: styles.surfaceTitle, children: t('noWorkspace') }), _jsx("div", { className: styles.surfaceHint, children: t('noWorkspaceHint') })] })), state.surface.phase === 'loading' && (_jsx("div", { className: styles.surfaceLoading, role: "status", children: t('loading') })), state.surface.phase === 'root-error' && (_jsxs("div", { className: styles.surface, role: "alert", children: [_jsx("div", { className: styles.surfaceTitle, children: state.surface.error.code === 'not-found' ? t('rootDeleted') : t('loadFailed') }), _jsx("div", { className: styles.surfaceHint, children: state.surface.error.message }), _jsx("button", { type: "button", className: styles.retry, onClick: () => { void store.loadRoot(); }, children: t('retry') })] })), state.surface.phase === 'loaded' && state.root !== undefined && (_jsx("div", { className: styles.tree, role: "tree", "aria-label": 'Explorer — ' + basename(state.root), onKeyDown: onKeyDown, children: renderNodes(state.nodes[state.root]?.children ?? [], 0) }))] }));
}
//# sourceMappingURL=ExplorerPanel.js.map