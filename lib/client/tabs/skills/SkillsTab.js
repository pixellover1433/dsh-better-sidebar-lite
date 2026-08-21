import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Skills tab panel: shows the FULL harness skill catalog by reading the host
 * skill-registry service (ctx.skills) over the skills/list endpoint. The fetch
 * is cwd-scoped (skill lookup is cwd-sensitive, so the active workspace root is
 * sent), and the host merges the reachable harness scopes (global layer + the
 * active agent's layer chain when a session id is present). Any domain error
 * returned by the host (as a value-slot SidebarResult, now rare — only
 * bad-request) is logged to the browser console so a broken tab is diagnosable.
 * A listing failure (an absent registry or a registry error) is surfaced by the
 * host as a SUCCESS result carrying a `warning` string, which the tab renders as
 * a visible hint above the catalog rather than a hard error. list() already
 * returns every skill with its invocation status (enabled/disabled/model-only/
 * user-only), so the tab renders the full catalog — it does not filter by
 * invocability.
 * Display-only — each row shows the skill's name, description, and its
 * model/user invocation status derived from the resolved invocation policy.
 * Auto-loads via a silent fallback poll on an interval (so skills appear as the
 * catalog is populated after mount), in addition to a manual refresh and one
 * fetch on mount (or when the active session or workspace changes).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Endpoints } from "../../../contract/rpc.js";
import { useDock } from "../../dock/context.js";
import { resolveRoot } from "../../workspace-root.js";
import { RefreshIcon, SkillsIcon } from "../../icons.js";
import { useBetterSidebarSettings } from "../shared/settings.js";
import { SkillDetailView } from "./SkillDetailView.js";
import styles from './skills.module.css';
export function skillStatus(entry) {
    const { modelInvocable, userInvocable } = entry.invocation;
    if (modelInvocable && userInvocable)
        return 'enabled';
    if (!modelInvocable && !userInvocable)
        return 'disabled';
    return modelInvocable ? 'modelOnly' : 'userOnly';
}
/** Localized key per status, and the CSS class riding alongside. */
export const STATUS_KEY = {
    enabled: 'statusEnabled',
    disabled: 'statusDisabled',
    modelOnly: 'statusModelOnly',
    userOnly: 'statusUserOnly',
};
export function SkillsTab({ rpc, emitter, t }) {
    const { useSessions, useWorkspaces, settings } = useDock();
    const sessions = useSessions(s => s);
    const workspaces = useWorkspaces(w => w);
    const root = resolveRoot(sessions, workspaces);
    const sessionId = sessions.current;
    const { skillsPollMs } = useBetterSidebarSettings(settings);
    const [state, setState] = useState({ kind: 'loading' });
    const controllerRef = useRef(null);
    // The skill row currently open in the detail view (replaces the catalog
    // list); undefined renders the list.
    const [selected, setSelected] = useState(undefined);
    /** Fetch the catalog, superseding any in-flight request. Non-silent calls
     *  blank the list to a loading state; silent calls (the fallback poll) refresh
     *  behind the currently-rendered list so it is never blanked. */
    const fetchCatalog = useCallback((opts) => {
        if (root === undefined) {
            if (!opts.silent)
                setState({ kind: 'noWorkspace' });
            return;
        }
        controllerRef.current?.abort();
        const ctrl = new AbortController();
        controllerRef.current = ctrl;
        if (!opts.silent)
            setState({ kind: 'loading' });
        void (async () => {
            // SessionId may be undefined when no active session resolves; omit it
            // rather than send an explicit undefined, which exactOptionalPropertyTypes
            // forbids on the contract. cwd is always sent — skill lookup is cwd-sensitive.
            const payload = { cwd: root, ...(sessionId === undefined ? {} : { sessionId }) };
            const res = await rpc.call(Endpoints.skillsList, payload, { signal: ctrl.signal });
            if (ctrl.signal.aborted)
                return;
            if (res.ok)
                setState({ kind: 'loaded', skills: res.value.skills, ...(res.value.warning === undefined ? {} : { warning: res.value.warning }) });
            else {
                // The host surfaced a domain error (value-slot SidebarResult), which is
                // now rare — only a malformed request reaches this branch. It must still
                // not crash on an empty `error` object, and the full received object is
                // logged so a broken tab is diagnosable from the browser console.
                console.error('better-sidebar: skills/list failed', JSON.stringify(res));
                setState({ kind: 'error', message: res.error?.message ?? '' });
            }
        })();
    }, [rpc, root, sessionId]);
    /** Normal (non-silent) refresh used by the header/retry buttons and mount. */
    const refresh = useCallback(() => { void fetchCatalog({ silent: false }); }, [fetchCatalog]);
    // Fetch on mount; abort a still-in-flight request on unmount.
    useEffect(() => {
        refresh();
        return () => controllerRef.current?.abort();
    }, [refresh]);
    /**
     * Fallback poll: catches skills injected into the session after mount by
     * re-fetching silently so the already-loaded list is never blanked. Runs only
     * while this tab is mounted, skips hidden documents, and supersedes any
     * in-flight request (fetchCatalog aborts it). Skipped entirely while a skill
     * detail is open so the poll cannot churn RPC calls behind the reader.
     * The cadence comes from the plugin settings (Skills tab auto-refresh),
     * defaulting to 100ms.
     */
    useEffect(() => {
        if (root === undefined)
            return;
        if (selected !== undefined)
            return;
        const id = window.setInterval(() => {
            if (document.hidden)
                return;
            void fetchCatalog({ silent: true });
        }, skillsPollMs);
        return () => window.clearInterval(id);
    }, [root, fetchCatalog, skillsPollMs, selected]);
    return (_jsxs("div", { className: styles.panel, children: [_jsxs("div", { className: styles.header, children: [_jsxs("span", { className: styles.title, children: [_jsx(SkillsIcon, { size: 14 }), _jsx("span", { children: t('tabLabel') })] }), _jsx("button", { type: "button", className: styles.iconButton, "aria-label": t('refresh'), onClick: refresh, children: _jsx(RefreshIcon, { size: 14 }) })] }), _jsxs("div", { className: styles.body, children: [selected !== undefined
                        ? (root === undefined
                            ? (_jsxs("div", { className: styles.state, children: [_jsx("div", { className: styles.stateTitle, children: t('noWorkspace') }), _jsx("div", { className: styles.stateHint, children: t('noWorkspaceHint') })] }))
                            : (_jsx(SkillDetailView, { rpc: rpc, emitter: emitter, t: t, skillName: selected, root: root, sessionId: sessionId, onBack: () => setSelected(undefined) })))
                        : state.kind === 'loading' && _jsx("div", { className: styles.loading, children: t('loading') }), selected === undefined && state.kind === 'error' && (_jsxs("div", { className: styles.state, children: [_jsx("div", { className: styles.stateTitle, children: t('errorTitle') }), _jsx("div", { className: styles.stateHint, children: state.message }), _jsx("button", { type: "button", className: styles.stateAction, onClick: refresh, children: t('errorRetry') })] })), selected === undefined && state.kind === 'noWorkspace' && (_jsxs("div", { className: styles.state, children: [_jsx("div", { className: styles.stateTitle, children: t('noWorkspace') }), _jsx("div", { className: styles.stateHint, children: t('noWorkspaceHint') })] })), selected === undefined && state.kind === 'loaded' && state.warning !== undefined && (_jsxs("div", { className: styles.warning, children: [_jsx("span", { className: styles.warningTitle, children: t('warningTitle') }), _jsx("span", { className: styles.warningText, children: state.warning })] })), selected === undefined && state.kind === 'loaded' && state.skills.length === 0 && (_jsxs("div", { className: styles.empty, children: [_jsx("div", { className: styles.stateTitle, children: t('emptyTitle') }), _jsx("div", { className: styles.stateHint, children: t('emptyHint') })] })), selected === undefined && state.kind === 'loaded' && state.skills.length > 0 && (_jsx("ul", { className: styles.list, children: state.skills.map(skill => {
                            const status = skillStatus(skill);
                            const statusLabel = t(STATUS_KEY[status]);
                            return (_jsxs("li", { className: styles.row, onDoubleClick: () => setSelected(skill.name), title: skill.name, children: [_jsx("span", { className: styles.skillName, children: skill.name }), _jsx("span", { className: styles.skillDesc, children: skill.description }), _jsx("span", { className: `${styles.statusBadge} ${styles[status]}`, "aria-label": statusLabel, children: statusLabel })] }, skill.name));
                        }) }))] })] }));
}
//# sourceMappingURL=SkillsTab.js.map