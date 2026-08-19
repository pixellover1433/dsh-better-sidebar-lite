import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Skills tab panel: lists the harness's available agent "skills" by reading
 * the host skill-registry service (ctx.skills) over the skills/list endpoint.
 * Display-only — each row shows the skill's name, description, and its
 * model/user invocation status derived from the resolved invocation policy.
 * Simpler than the git tab: no workspace/session dependency, no auto-refresh
 * polling — a manual refresh and one fetch on mount.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Endpoints } from "../../../contract/rpc.js";
import { RefreshIcon, SkillsIcon } from "../../icons.js";
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
const STATUS_KEY = {
    enabled: 'statusEnabled',
    disabled: 'statusDisabled',
    modelOnly: 'statusModelOnly',
    userOnly: 'statusUserOnly',
};
export function SkillsTab({ rpc, t }) {
    const [state, setState] = useState({ kind: 'loading' });
    const controllerRef = useRef(null);
    /** Fetch the catalog, superseding any in-flight request. */
    const refresh = useCallback(() => {
        controllerRef.current?.abort();
        const ctrl = new AbortController();
        controllerRef.current = ctrl;
        setState({ kind: 'loading' });
        void (async () => {
            const res = await rpc.call(Endpoints.skillsList, {}, { signal: ctrl.signal });
            if (ctrl.signal.aborted)
                return;
            if (res.ok)
                setState({ kind: 'loaded', skills: res.value.skills });
            else
                setState({ kind: 'error', message: res.error.message });
        })();
    }, [rpc]);
    // Fetch on mount; abort a still-in-flight request on unmount.
    useEffect(() => {
        refresh();
        return () => controllerRef.current?.abort();
    }, [refresh]);
    return (_jsxs("div", { className: styles.panel, children: [_jsxs("div", { className: styles.header, children: [_jsxs("span", { className: styles.title, children: [_jsx(SkillsIcon, { size: 14 }), _jsx("span", { children: t('tabLabel') })] }), _jsx("button", { type: "button", className: styles.iconButton, "aria-label": t('refresh'), onClick: refresh, children: _jsx(RefreshIcon, { size: 14 }) })] }), _jsxs("div", { className: styles.body, children: [state.kind === 'loading' && _jsx("div", { className: styles.loading, children: t('loading') }), state.kind === 'error' && (_jsxs("div", { className: styles.state, children: [_jsx("div", { className: styles.stateTitle, children: t('errorTitle') }), _jsx("div", { className: styles.stateHint, children: state.message }), _jsx("button", { type: "button", className: styles.stateAction, onClick: refresh, children: t('errorRetry') })] })), state.kind === 'loaded' && state.skills.length === 0 && (_jsxs("div", { className: styles.empty, children: [_jsx("div", { className: styles.stateTitle, children: t('emptyTitle') }), _jsx("div", { className: styles.stateHint, children: t('emptyHint') })] })), state.kind === 'loaded' && state.skills.length > 0 && (_jsx("ul", { className: styles.list, children: state.skills.map(skill => {
                            const status = skillStatus(skill);
                            const statusLabel = t(STATUS_KEY[status]);
                            return (_jsxs("li", { className: styles.row, children: [_jsx("span", { className: styles.skillName, children: skill.name }), _jsx("span", { className: styles.skillDesc, children: skill.description }), _jsx("span", { className: `${styles.statusBadge} ${styles[status]}`, "aria-label": statusLabel, children: statusLabel })] }, skill.name));
                        }) }))] })] }));
}
//# sourceMappingURL=SkillsTab.js.map