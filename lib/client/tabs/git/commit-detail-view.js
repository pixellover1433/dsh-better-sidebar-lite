import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import styles from './git.module.css';
/** Status letter -> visual tone (reuses the status-view palette classes). */
function toneOf(status) {
    switch (status) {
        case 'A': return 'added';
        case 'M':
        case 'T': return 'modified';
        case 'D': return 'deleted';
        case 'R': return 'renamed';
        case 'C': return 'copied';
        default: return 'other';
    }
}
const TONE_CLASS = {
    added: styles.added,
    modified: styles.modified,
    deleted: styles.deleted,
    renamed: styles.renamed,
    copied: styles.modified,
    other: styles.muted,
};
const dateFormatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
});
export function CommitDetailView({ commit, state, t, onBack, onRetry, onOpenFile }) {
    return (_jsxs("div", { className: styles.commitDetail, children: [_jsxs("div", { className: styles.commitDetailHead, children: [_jsxs("button", { type: "button", className: styles.backButton, onClick: onBack, children: ['\u2190 ', t('back')] }), _jsx("div", { className: styles.commitDetailTitle, children: commit.subject }), _jsxs("div", { className: styles.commitMeta, children: [_jsx("span", { className: styles.commitHash, children: commit.shortHash }), _jsx("span", { className: styles.commitAuthor, children: commit.authorName }), _jsx("time", { className: styles.commitDate, dateTime: commit.authoredAtISO, children: dateFormatter.format(new Date(commit.authoredAtISO)) })] })] }), state.kind === 'loading' && _jsx("div", { className: styles.loading, children: t('loading') }), state.kind === 'error' && (_jsxs("div", { className: styles.state, children: [_jsx("div", { className: styles.stateHint, children: state.message }), _jsx("button", { type: "button", className: styles.stateAction, onClick: onRetry, children: t('errorRetry') })] })), state.kind === 'loaded' && (_jsxs(_Fragment, { children: [state.result.message.length > 0 && (_jsx("pre", { className: styles.commitMessage, children: state.result.message })), state.result.files.length === 0
                        ? _jsx("div", { className: styles.empty, children: t('emptyCommitFiles') })
                        : (_jsx("div", { className: styles.commitFiles, children: state.result.files.map(file => {
                                const cls = TONE_CLASS[toneOf(file.status)];
                                return (_jsxs("div", { className: styles.commitFileRow, onDoubleClick: () => onOpenFile(file), title: file.path, children: [_jsx("span", { className: [styles.fileStatus, cls].filter(Boolean).join(' '), children: file.status }), _jsxs("span", { className: styles.filePath, children: [file.originalPath !== undefined && (_jsxs("span", { className: styles.originalPath, children: [file.originalPath, " ", '\u2192', " "] })), _jsx("span", { className: styles.commitFilePath, children: file.path })] })] }, file.path));
                            }) }))] }))] }));
}
//# sourceMappingURL=commit-detail-view.js.map