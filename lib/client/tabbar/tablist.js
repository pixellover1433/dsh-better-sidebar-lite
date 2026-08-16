import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Presentational tab bar (ADR-003, D7 §7.2): a role=tablist of buttons with
 * icon + label, roving tabindex, and arrow-key (Left/Right + Home/End)
 * activation. Pure — the dock feeds it a resolved snapshot.
 */
import { useRef } from 'react';
import css from './tablist.module.css';
/** Stable ids shared by the tab buttons and the tab panel. */
export const tabPanelId = (id) => `bsd-panel-${id}`;
export const tabButtonId = (id) => `bsd-tab-${id}`;
export function TabList({ tabs, activeId, onSelect, label }) {
    const buttons = useRef(new Map());
    const focusTab = (index) => {
        const next = tabs[(index + tabs.length) % tabs.length];
        if (next === undefined)
            return;
        buttons.current.get(next.id)?.focus();
        onSelect(next.id);
    };
    const onKeyDown = (e) => {
        const index = tabs.findIndex(t => t.id === activeId);
        if (index === -1)
            return;
        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                e.preventDefault();
                focusTab(index + 1);
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                e.preventDefault();
                focusTab(index - 1);
                break;
            case 'Home':
                e.preventDefault();
                focusTab(0);
                break;
            case 'End':
                e.preventDefault();
                focusTab(tabs.length - 1);
                break;
            default:
                break;
        }
    };
    return (_jsx("div", { role: "tablist", "aria-label": label, className: css.list, onKeyDown: onKeyDown, children: tabs.map(t => {
            const selected = t.id === activeId;
            return (_jsxs("button", { ref: node => {
                    if (node)
                        buttons.current.set(t.id, node);
                    else
                        buttons.current.delete(t.id);
                }, role: "tab", id: tabButtonId(t.id), "aria-selected": selected, "aria-controls": tabPanelId(t.id), tabIndex: selected ? 0 : -1, className: selected ? css.tabActive : css.tabInactive, onClick: () => onSelect(t.id), children: [t.icon, _jsx("span", { className: css.label, children: t.label })] }, t.id));
        }) }));
}
//# sourceMappingURL=tablist.js.map