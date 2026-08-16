import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ExpandIcon } from "../icons.js";
import { TOGGLE_EVENT } from "./dock.js";
import css from './footer-toggle.module.css';
/** The footer entry component: receives the sidebar's { wide } owner share. */
export function createSidebarToggleAction(t) {
    const SidebarToggleAction = (props) => (_jsxs("button", { type: "button", className: props.wide ? css.wide : css.rail, "aria-label": t('toggle.sidebar'), title: t('toggle.sidebar'), onClick: () => { window.dispatchEvent(new CustomEvent(TOGGLE_EVENT)); }, children: [_jsx(ExpandIcon, { size: props.wide ? 16 : 18 }), props.wide && _jsx("span", { className: css.label, children: t('toggle.sidebar') })] }));
    return SidebarToggleAction;
}
//# sourceMappingURL=footer-toggle.js.map