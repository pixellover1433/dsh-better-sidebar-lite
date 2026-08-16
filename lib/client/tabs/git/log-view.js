import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import styles from './git.module.css';
const dateFormatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
});
export function GitLogView({ result, t, onLoadMore, onSelectCommit }) {
    const hasCommits = result.entries.length > 0;
    return (_jsxs("div", { children: [_jsx("div", { className: styles.commits, children: hasCommits ? (result.entries.map(entry => {
                    const date = dateFormatter.format(new Date(entry.authoredAtISO));
                    return (_jsxs("button", { type: "button", className: styles.commitRow, onClick: () => onSelectCommit(entry), "aria-label": t('commitDetailTitle') + ': ' + entry.subject, title: t('commitDetailTitle'), children: [_jsx("div", { className: styles.commitSubject, children: entry.subject }), _jsxs("div", { className: styles.commitMeta, children: [_jsx("span", { className: styles.commitHash, children: entry.shortHash }), _jsx("span", { className: styles.commitAuthor, children: entry.authorName }), _jsx("time", { className: styles.commitDate, dateTime: entry.authoredAtISO, children: date })] })] }, entry.hash));
                })) : (_jsx("div", { className: styles.empty, children: t('emptyLog') })) }), result.truncated && (_jsx("button", { type: "button", className: styles.loadMore, onClick: onLoadMore, children: t('loadMore') }))] }));
}
//# sourceMappingURL=log-view.js.map