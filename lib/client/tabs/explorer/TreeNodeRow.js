import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { ChevronDownIcon, ChevronRightIcon, FileIcon, FolderIcon, SymlinkIcon, } from "../../icons.js";
import styles from './ExplorerPanel.module.css';
function RowIcon({ entry }) {
    if (entry.kind === 'directory')
        return _jsx(FolderIcon, { size: 15 });
    if (entry.kind === 'symlink')
        return _jsx(SymlinkIcon, { size: 15 });
    return _jsx(FileIcon, { size: 15 });
}
export function TreeNodeRow(props) {
    const { entry, depth, expanded, selected, focused, loadState, retryLabel, expandLabel, collapseLabel, errorMessage, onToggle, onActivate, onOpen, onRetry, rowRef, } = props;
    const dir = entry.kind === 'directory';
    const inlineError = dir && loadState === 'error';
    return (_jsxs("div", { ref: rowRef, role: "treeitem", tabIndex: focused ? 0 : -1, "aria-selected": selected, "aria-expanded": dir ? expanded : undefined, "aria-label": entry.name, className: [
            styles.row,
            selected && styles.rowSelected,
            focused && styles.rowFocused,
        ].filter(Boolean).join(' '), "data-path": entry.path, style: { paddingLeft: 8 + depth * 16 }, onClick: onActivate, onDoubleClick: () => { if (dir)
            onToggle();
        else
            onOpen(); }, children: [dir ? (_jsx("button", { type: "button", tabIndex: -1, "data-caret": true, "aria-label": expanded ? collapseLabel : expandLabel, className: styles.caret, onClick: (event) => { event.stopPropagation(); onToggle(); }, children: expanded ? _jsx(ChevronDownIcon, { size: 14 }) : _jsx(ChevronRightIcon, { size: 14 }) })) : (_jsx("span", { className: [styles.caret, styles.caretPlaceholder].join(' '), "aria-hidden": true })), _jsx("span", { className: styles.icon, "aria-hidden": true, children: _jsx(RowIcon, { entry: entry }) }), _jsx("span", { className: styles.name, children: entry.name }), entry.kind === 'symlink' && entry.linkTarget !== undefined && (_jsxs("span", { className: styles.symlinkTarget, title: entry.linkTarget, "aria-hidden": true, children: ['→ ', entry.linkTarget] })), inlineError && (_jsxs(_Fragment, { children: [errorMessage !== undefined && _jsx("span", { className: styles.inlineError, children: errorMessage }), _jsx("button", { type: "button", className: styles.retry, onClick: (event) => { event.stopPropagation(); onRetry(); }, children: retryLabel })] }))] }));
}
//# sourceMappingURL=TreeNodeRow.js.map