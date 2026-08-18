import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Endpoints } from "../../../contract/rpc.js";
import styles from './git.module.css';
// css-modules typing (noUncheckedIndexedAccess) yields string | undefined per class.
const TONE_CLASS = {
    added: styles.added,
    modified: styles.modified,
    deleted: styles.deleted,
    renamed: styles.renamed,
    unmerged: styles.unmerged,
    untracked: styles.untracked,
};
/** Map a porcelain state letter to the visual tone. */
function toneOfLetter(letter) {
    switch (letter) {
        case 'A': return 'added';
        case 'D': return 'deleted';
        case 'R':
        case 'C': return 'renamed';
        case 'U': return 'unmerged';
        case '?': return 'untracked';
        default: return 'modified'; // M, T, or unknown letters read as modified
    }
}
/**
 * The single glyph for a row. Untracked and conflicted entries state their kind
 * directly; others use the index letter (staged) or worktree letter (unstaged).
 */
function glyphOf(entry) {
    if (entry.untracked)
        return { letter: '?', tone: 'untracked' };
    if (entry.conflicted)
        return { letter: 'U', tone: 'unmerged' };
    const raw = entry.staged ? entry.xy.charAt(0) : entry.xy.charAt(1);
    const letter = raw === '' || raw === ' ' ? 'M' : raw;
    return { letter, tone: toneOfLetter(letter) };
}
/** Join a base class with an optional tone class, dropping undefined. */
function composeGlyph(base, tone) {
    const prefix = base === undefined ? '' : base;
    return tone === undefined ? prefix : prefix + ' ' + tone;
}
/** Last path segment (bold) with the parent dirs dimmed. */
function PathDisplay({ path }) {
    const idx = path.lastIndexOf('/');
    if (idx === -1)
        return _jsx("span", { className: styles.fileName, children: path });
    return (_jsxs("span", { children: [_jsx("span", { className: styles.fileDir, children: path.slice(0, idx + 1) }), _jsx("span", { className: styles.fileName, children: path.slice(idx + 1) })] }));
}
/** Per-row actions: Unstage when staged, Stage + Discard when unstaged/untracked. */
function RowActions({ entry, onStage, onUnstage, onDiscard, t }) {
    return (_jsxs("span", { className: styles.rowActions, children: [entry.staged && (_jsx("button", { type: "button", className: styles.rowAction, "aria-label": t('unstage') + ' ' + entry.path, onClick: () => onUnstage(entry), children: t('unstage') })), (entry.unstaged || entry.untracked) && (_jsx("button", { type: "button", className: styles.rowAction, "aria-label": t('stage') + ' ' + entry.path, onClick: () => onStage(entry), children: t('stage') })), (entry.unstaged || entry.untracked) && (_jsx("button", { type: "button", className: styles.rowAction + ' ' + styles.discardAction, "aria-label": t('discard') + ' ' + entry.path, onClick: () => onDiscard(entry), children: t('discard') }))] }));
}
function Row({ entry, onStage, onUnstage, onDiscard, onOpen, t }) {
    const { letter, tone } = glyphOf(entry);
    const originalPath = entry.originalPath;
    const fullLabel = originalPath === undefined ? entry.path : originalPath + ' -> ' + entry.path;
    return (_jsxs("div", { className: styles.row, "aria-label": fullLabel, title: fullLabel, onDoubleClick: () => onOpen(entry), children: [_jsx("span", { className: composeGlyph(styles.glyph, TONE_CLASS[tone]), "aria-hidden": "true", children: letter }), _jsxs("span", { className: styles.filePath, children: [entry.originalPath !== undefined && (_jsxs("span", { className: styles.originalPath, children: [entry.originalPath, " \u2192 "] })), _jsx(PathDisplay, { path: entry.path })] }), _jsx(RowActions, { entry: entry, onStage: onStage, onUnstage: onUnstage, onDiscard: onDiscard, t: t })] }));
}
function Section({ title, entries, t, onStage, onUnstage, onDiscard, onOpen, sectionAction, conflictStyles }) {
    const cls = conflictStyles ? styles.section + ' ' + styles.conflictSection : styles.section;
    return (_jsxs("section", { className: cls, children: [_jsxs("div", { className: styles.sectionHeader, children: [_jsxs("span", { className: styles.sectionTitle, children: [title, _jsx("span", { className: styles.sectionCount, children: entries.length })] }), sectionAction !== undefined && (_jsx("button", { type: "button", className: styles.sectionAction, onClick: sectionAction.onClick, children: sectionAction.label }))] }), _jsx("div", { className: styles.rows, children: entries.map(entry => (_jsx(Row, { entry: entry, onStage: onStage, onUnstage: onUnstage, onDiscard: onDiscard, onOpen: onOpen, t: t }, entry.path))) })] }));
}
export function GitStatusView({ result, root, rpc, emitter, t, onChanged, onActionError, onDiscard, onDiscardAll }) {
    async function stagePaths(files) {
        const res = await rpc.call(Endpoints.gitStage, { path: root, files });
        if (res.ok) {
            onChanged();
            return;
        }
        onActionError(res.error.message);
    }
    async function unstagePaths(files) {
        const res = await rpc.call(Endpoints.gitUnstage, { path: root, files });
        if (res.ok) {
            onChanged();
            return;
        }
        onActionError(res.error.message);
    }
    /** Open a row's working-tree file via the shared modal (double-click). */
    const openFile = (entry) => {
        // entry.path is `/`-separated repo-relative; join with the worktree root.
        const path = root + '/' + entry.path;
        const name = entry.path.slice(entry.path.lastIndexOf('/') + 1);
        // Untracked files have no tracked base to diff (working tree vs index is a
        // no-op for them), so they open with no `diff` and the editor shows the full
        // new-file content via explorer/read — a "fully added" representation.
        if (!entry.untracked) {
            const base = entry.staged ? 'head' : 'index';
            emitter.emit({
                path, name, kind: 'file', source: 'double-click', rootPath: root,
                diff: { kind: 'status', base, root, file: entry.path },
            });
            return;
        }
        emitter.emit({ path, name, kind: 'file', source: 'double-click', rootPath: root });
    };
    const onStage = (entry) => { void stagePaths([entry.path]); };
    const onUnstage = (entry) => { void unstagePaths([entry.path]); };
    const hasChanges = result.staged.length > 0 || result.conflicted.length > 0
        || result.unstaged.length > 0 || result.untracked.length > 0;
    if (!hasChanges) {
        return _jsx("div", { className: styles.empty, children: t('emptyStatus') });
    }
    const discardable = result.unstaged.length > 0 || result.untracked.length > 0;
    return (_jsxs(_Fragment, { children: [discardable && (_jsx("div", { className: styles.discardAllRow, children: _jsx("button", { type: "button", className: styles.discardAllButton, onClick: onDiscardAll, children: t('discardAll') }) })), _jsxs("div", { className: styles.statusSections, children: [result.staged.length > 0 && (_jsx(Section, { title: t('staged'), entries: result.staged, t: t, onStage: onStage, onUnstage: onUnstage, onDiscard: onDiscard, onOpen: openFile, sectionAction: {
                            label: t('unstageAll'),
                            onClick: () => { void unstagePaths(result.staged.map(e => e.path)); },
                        } })), result.conflicted.length > 0 && (_jsx(Section, { title: t('conflicts'), entries: result.conflicted, t: t, onStage: onStage, onUnstage: onUnstage, onDiscard: onDiscard, onOpen: openFile, conflictStyles: true })), result.unstaged.length > 0 && (_jsx(Section, { title: t('changes'), entries: result.unstaged, t: t, onStage: onStage, onUnstage: onUnstage, onDiscard: onDiscard, onOpen: openFile, sectionAction: {
                            label: t('stageAll'),
                            onClick: () => { void stagePaths(result.unstaged.map(e => e.path)); },
                        } })), result.untracked.length > 0 && (_jsx(Section, { title: t('untracked'), entries: result.untracked, t: t, onStage: onStage, onUnstage: onUnstage, onDiscard: onDiscard, onOpen: openFile, sectionAction: {
                            label: t('stageAll'),
                            onClick: () => { void stagePaths(result.untracked.map(e => e.path)); },
                        } }))] })] }));
}
//# sourceMappingURL=status-view.js.map