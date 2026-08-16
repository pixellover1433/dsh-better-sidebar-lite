import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function base({ size = 16, ...rest }) {
    return {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        ...rest,
    };
}
export function FolderIcon(props) {
    return _jsx("svg", { ...base(props), children: _jsx("path", { d: "M1.5 4.5a1 1 0 0 1 1-1h3.2l1.6 1.6h5.2a1 1 0 0 1 1 1v5.4a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-7z" }) });
}
export function FileIcon(props) {
    return _jsxs("svg", { ...base(props), children: [_jsx("path", { d: "M3.5 1.5h5.6l3.4 3.4v9.6h-9z" }), _jsx("path", { d: "M9 1.5v3.4h3.4" })] });
}
export function SymlinkIcon(props) {
    return _jsxs("svg", { ...base(props), children: [_jsx("path", { d: "M3 3h5.5l2 2.5" }), _jsx("path", { d: "M8.5 5.5L13 12" }), _jsx("path", { d: "M9 12h4" })] });
}
export function GitBranchIcon(props) {
    return _jsxs("svg", { ...base(props), children: [_jsx("circle", { cx: "4.5", cy: "4", r: "1.6" }), _jsx("circle", { cx: "4.5", cy: "12", r: "1.6" }), _jsx("circle", { cx: "11.5", cy: "6", r: "1.6" }), _jsx("path", { d: "M4.5 5.6v4.8" }), _jsx("path", { d: "M6.1 6.3c2.6-.4 5.4.5 5.4 2.6" })] });
}
export function ChevronRightIcon(props) {
    return _jsx("svg", { ...base(props), children: _jsx("path", { d: "M6 3.5L10.5 8L6 12.5" }) });
}
export function ChevronDownIcon(props) {
    return _jsx("svg", { ...base(props), children: _jsx("path", { d: "M3.5 6L8 10.5L12.5 6" }) });
}
export function RefreshIcon(props) {
    return _jsxs("svg", { ...base(props), children: [_jsx("path", { d: "M13.5 8a5.5 5.5 0 1 1-1.6-3.9" }), _jsx("path", { d: "M13.5 1.8v2.6h-2.6" })] });
}
export function CollapseIcon(props) {
    return _jsxs("svg", { ...base(props), children: [_jsx("path", { d: "M11 3.5V12.5" }), _jsx("path", { d: "M5 4l4 4l-4 4" })] });
}
export function ExpandIcon(props) {
    return _jsxs("svg", { ...base(props), children: [_jsx("path", { d: "M5 3.5v9" }), _jsx("path", { d: "M11 4l-4 4l4 4" })] });
}
//# sourceMappingURL=icons.js.map