import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * FileModalEditor (ADR-004): the single consumer of open-file events. It
 * subscribes once to the shared open-file emitter at the dock root and renders
 * a modal over the ENTIRE sidebar (any tab) whenever a file is opened — from
 * the explorer double-click/Enter or a git status-row double-click. Content is
 * fetched through the /better-sidebar RPC channel; the dock shell has no
 * filesystem access, so every read goes to the host.
 *
 * Mounted inside DockContext.Provider but outside the TabPanel branch in
 * DockRoot, so it overlays regardless of which tab is active and still works
 * when the dock is collapsed (the provider always renders).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Endpoints } from "../../contract/rpc.js";
import { CloseIcon } from "../icons.js";
import styles from './FileModalEditor.module.css';
/**
 * The sidebar-wide file modal. Subscribes to open-file events once per mount
 * and supersedes an in-flight read when a newer open arrives, so rapid
 * double-clicks always settle on the last-opened file.
 */
export function FileModalEditor({ rpc, events, t }) {
    const [file, setFile] = useState(null);
    const requestIdRef = useRef(0);
    useEffect(() => {
        const disposer = events.onOpenFile((event) => {
            const id = ++requestIdRef.current;
            const diff = event.diff;
            const mode = diff === undefined ? 'content' : 'diff';
            setFile({ path: event.path, name: event.name, rootPath: event.rootPath, mode, phase: 'loading' });
            void (async () => {
                // Untracked/missing rows and explorer opens carry no `diff`, so read the
                // raw file; tracked git opens fetch the file's diff instead.
                const res = diff === undefined
                    ? await rpc.call(Endpoints.explorerRead, { path: event.path })
                    : await rpc.call(Endpoints.gitDiff, { path: diff.root, file: diff.file, base: diff.base });
                // A newer open superseded this read: drop the stale response.
                if (requestIdRef.current !== id)
                    return;
                if (res.ok) {
                    // Explorer reads carry `truncated`; git diffs carry `diff` and never
                    // truncate (git output for one file is already bounded).
                    const { content, truncated } = 'truncated' in res.value
                        ? { content: res.value.content, truncated: res.value.truncated }
                        : { content: res.value.diff, truncated: false };
                    setFile({
                        path: event.path,
                        name: event.name,
                        rootPath: event.rootPath,
                        mode,
                        phase: 'loaded',
                        content,
                        truncated,
                    });
                }
                else {
                    setFile({
                        path: event.path,
                        name: event.name,
                        rootPath: event.rootPath,
                        mode,
                        phase: 'error',
                        errorMessage: res.error.message,
                    });
                }
            })();
        });
        return disposer;
    }, [events, rpc]);
    const close = useCallback(() => {
        // Invalidate any in-flight read so its late response cannot reopen the modal.
        requestIdRef.current += 1;
        setFile(null);
    }, []);
    // Escape closes the modal; the listener is armed only while one is open.
    useEffect(() => {
        if (file === null)
            return;
        const onKey = (e) => {
            if (e.key === 'Escape')
                close();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [file, close]);
    if (file === null)
        return null;
    return (_jsx("div", { className: styles.backdrop, onClick: close, role: "presentation", children: _jsxs("div", { className: styles.dialog, role: "dialog", "aria-modal": "true", "aria-label": t('editor.title'), onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: styles.header, children: [_jsx("span", { className: styles.title, title: file.path, children: file.name }), _jsx("button", { type: "button", className: styles.closeButton, "aria-label": t('editor.close'), title: t('editor.close'), onClick: close, children: _jsx(CloseIcon, { size: 16 }) })] }), _jsxs("div", { className: styles.body, children: [file.phase === 'loading' && (_jsx("div", { className: styles.status, role: "status", children: t('editor.loading') })), file.phase === 'error' && (_jsx("div", { className: styles.error, role: "alert", children: file.errorMessage })), file.phase === 'loaded' && (_jsxs(_Fragment, { children: [_jsx("pre", { className: styles.content, children: file.content }), file.truncated === true && _jsx("div", { className: styles.truncated, children: t('editor.truncated') })] }))] })] }) }));
}
//# sourceMappingURL=FileModalEditor.js.map