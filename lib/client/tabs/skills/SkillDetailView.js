import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * Skill detail view: double-clicking a skill row opens its SKILL.md body plus
 * the sibling files its resource directory can reference (skills/detail).
 * Replaces the catalog list while open; the SkillsTab clears `selected` to go
 * back. Fetch state (loading / domain error / loaded-not-found / loaded) is
 * owned here and re-fetched via the same AbortController-supersede pattern the
 * catalog uses, so a superseded or unmounted request never touches state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Endpoints } from "../../../contract/rpc.js";
import { FileIcon } from "../../icons.js";
import { skillStatus, STATUS_KEY } from "./SkillsTab.js";
import styles from './skills.module.css';
export function SkillDetailView({ rpc, emitter, t, skillName, root, sessionId, onBack }) {
    const [state, setState] = useState({ kind: 'loading' });
    const controllerRef = useRef(null);
    /** Fetch the skill detail, superseding any in-flight or stale request. */
    const reload = useCallback(() => {
        controllerRef.current?.abort();
        const ctrl = new AbortController();
        controllerRef.current = ctrl;
        setState({ kind: 'loading' });
        void (async () => {
            // Omit an undefined sessionId (exactOptionalPropertyTypes) so the host
            // falls back to the host-global scope.
            const payload = { name: skillName, cwd: root, ...(sessionId === undefined ? {} : { sessionId }) };
            const res = await rpc.call(Endpoints.skillsDetail, payload, { signal: ctrl.signal });
            if (ctrl.signal.aborted)
                return;
            if (res.ok)
                setState({ kind: 'loaded', value: res.value });
            else {
                // The host surfaced a domain error (value-slot SidebarResult), which is
                // now rare — only a malformed request reaches this branch. Log it so a
                // broken detail is diagnosable from the browser console.
                console.error('better-sidebar: skills/detail failed', JSON.stringify(res));
                setState({ kind: 'error', message: res.error?.message ?? '' });
            }
        })();
    }, [rpc, skillName, root, sessionId]);
    // Fetch on mount / when the skill, workspace, or session changes; abort a
    // still-in-flight request on unmount.
    useEffect(() => {
        reload();
        return () => controllerRef.current?.abort();
    }, [reload]);
    const loaded = state.kind === 'loaded' ? state.value : undefined;
    const status = loaded?.found === true
        ? skillStatus({ name: loaded.name, description: loaded.description, invocation: loaded.invocation, source: loaded.source, provider: loaded.provider })
        : undefined;
    const statusLabel = status === undefined ? undefined : t(STATUS_KEY[status]);
    return (_jsxs("div", { className: styles.detail, children: [_jsxs("div", { className: styles.detailHeader, children: [_jsxs("button", { type: "button", className: styles.detailBackButton, "aria-label": t('detailBack'), onClick: onBack, children: ['\u2190 ', t('detailBack')] }), _jsx("span", { className: styles.detailName, children: skillName })] }), state.kind === 'loading' && _jsx("div", { className: styles.loading, children: t('loading') }), state.kind === 'error' && (_jsxs("div", { className: styles.state, children: [_jsx("div", { className: styles.stateTitle, children: t('errorTitle') }), _jsx("div", { className: styles.stateHint, children: state.message }), _jsx("button", { type: "button", className: styles.stateAction, onClick: reload, children: t('errorRetry') })] })), state.kind === 'loaded' && !state.value.found && (_jsxs("div", { className: styles.state, children: [_jsx("div", { className: styles.stateTitle, children: t('detailNotFound') }), state.value.warning !== undefined && _jsx("div", { className: styles.stateHint, children: state.value.warning }), _jsx("button", { type: "button", className: styles.stateAction, onClick: onBack, children: t('detailBack') })] })), loaded?.found === true && (_jsxs("div", { className: styles.detailBody, children: [_jsx("div", { className: styles.detailDesc, children: loaded.description }), loaded.whenToUse !== undefined && (_jsx("div", { className: styles.detailWhenToUse, children: loaded.whenToUse })), _jsxs("div", { className: styles.detailMeta, children: [_jsx("span", { className: styles.detailLabel, children: t('detailProvider') }), _jsx("span", { children: loaded.provider }), status !== undefined && statusLabel !== undefined && (_jsx("span", { className: `${styles.statusBadge} ${styles[status]}`, "aria-label": statusLabel, children: statusLabel }))] }), loaded.path !== undefined && (_jsx("div", { className: styles.detailPath, title: loaded.path, children: loaded.path })), loaded.resourceDir !== undefined && (_jsx("div", { className: styles.detailPath, title: loaded.resourceDir, children: loaded.resourceDir })), _jsx("div", { className: styles.detailSectionTitle, children: t('detailContentTitle') }), _jsx("pre", { className: styles.detailContent, children: loaded.content }), _jsx("div", { className: styles.detailSectionTitle, children: t('detailReferencesTitle') }), loaded.references.length === 0
                        ? _jsx("div", { className: styles.detailNoRefs, children: t('detailNoReferences') })
                        : (_jsx("ul", { className: styles.detailReferences, children: loaded.references.map(ref => (_jsxs("li", { className: styles.referenceItem, title: ref.path, onDoubleClick: () => emitter.emit({
                                    path: ref.path,
                                    name: ref.name,
                                    kind: 'file',
                                    source: 'double-click',
                                    rootPath: loaded.resourceDir ?? root,
                                }), children: [_jsx("span", { className: styles.referenceIcon, children: _jsx(FileIcon, { size: 13 }) }), _jsx("span", { className: styles.referenceName, children: ref.name })] }, ref.path))) }))] }))] }));
}
//# sourceMappingURL=SkillDetailView.js.map