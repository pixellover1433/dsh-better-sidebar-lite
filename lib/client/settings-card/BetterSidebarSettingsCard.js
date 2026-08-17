import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The plugin's settings card (ADR-004 §3 amendment). Registered into the shared
 * `settings.plugin.item` slot of Settings > Plugins > Plugin configuration, it
 * edits the plugin's auto-refresh tunables live. The markup, layout, and
 * `--dsw-alias-*` tokens mirror the shipped shell/agent-loop/web-search cards
 * (PluginCard + ValueField), so it reads as one of the suite rather than a
 * foreign control.
 */
import { useState } from 'react';
import { ChevronDownIcon } from "../icons.js";
import { SETTING_RANGES } from "../../contract/settings.js";
import pluginCardCss from './PluginCard.module.css';
import fieldsCss from './fields.module.css';
/** Field => label/hint key pairs, in display order. */
const FIELD_COPY = [
    { field: 'explorerPollMs', labelKey: 'explorerPollMs', hintKey: 'explorerPollMsHint' },
    { field: 'explorerDebounceMs', labelKey: 'explorerDebounceMs', hintKey: 'explorerDebounceMsHint' },
    { field: 'gitPollMs', labelKey: 'gitPollMs', hintKey: 'gitPollMsHint' },
    { field: 'gitDebounceMs', labelKey: 'gitDebounceMs', hintKey: 'gitDebounceMsHint' },
];
/** Build the invalid-value message stating the field's allowed range. */
function rangeInvalidLabel(t, field) {
    const { min, max } = SETTING_RANGES[field];
    return t('invalidRange').replace('{min}', String(min)).replace('{max}', String(max));
}
export function BetterSidebarSettingsCard(props) {
    const { t } = props;
    const [open, setOpen] = useState(false);
    const state = props.useSettingsCard(s => s);
    // A card renders nothing while its namespace is unavailable (mirrors the
    // shipped PluginCard), so a deployment that does not serve it shows no trace.
    if (!state.available)
        return null;
    const title = t('cardTitle');
    const blocked = !state.dirty || state.invalid || state.saving;
    return (_jsxs("li", { className: open ? pluginCardCss.card + ' ' + pluginCardCss.cardOpen : pluginCardCss.card, children: [_jsxs("button", { type: "button", className: pluginCardCss.header, "aria-expanded": open, "aria-label": `${t(open ? 'collapse' : 'expand')}: ${title}`, onClick: () => { setOpen(!open); }, children: [_jsxs("span", { className: pluginCardCss.headText, children: [_jsx("span", { className: pluginCardCss.name, children: title }), _jsx("span", { className: pluginCardCss.description, children: t('cardDescription') })] }), state.dirty ? _jsx("span", { className: pluginCardCss.pending, children: t('unsaved') }) : null, _jsx("span", { className: open ? pluginCardCss.chevron + ' ' + pluginCardCss.chevronOpen : pluginCardCss.chevron, children: _jsx(ChevronDownIcon, { size: 14 }) })] }), open
                ? (_jsxs("div", { className: pluginCardCss.body, children: [!state.writable ? _jsx("p", { className: pluginCardCss.readOnly, role: "status", children: t('readOnly') }) : null, FIELD_COPY.map(({ field, labelKey, hintKey }) => {
                            const f = state.fields[field] ?? { text: '', overridden: false, invalid: false };
                            return (_jsx(FieldControl, { id: 'plugin-config-better-sidebar-' + field, label: t(labelKey), hint: t(hintKey), text: f.text, overridden: f.overridden, invalid: f.invalid, overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: rangeInvalidLabel(t, field), disabled: !state.writable, onEdit: (text) => { props.edit(field, text); }, onReset: () => { props.resetField(field); } }, field));
                        }), _jsxs("div", { className: pluginCardCss.footer, children: [state.failed
                                    ? _jsx("p", { className: pluginCardCss.failed, role: "status", children: t('saveFailed') }) : null, _jsx("button", { type: "button", className: pluginCardCss.discard, disabled: !state.dirty || state.saving, onClick: props.discard, children: t('discard') }), _jsx("button", { type: "button", className: pluginCardCss.save, disabled: blocked, onClick: props.save, children: t(state.saving ? 'saving' : 'save') })] })] }))
                : null] }));
}
function FieldControl(props) {
    return (_jsxs("div", { className: fieldsCss.field, children: [_jsxs("div", { className: fieldsCss.head, children: [_jsx("label", { className: fieldsCss.label, htmlFor: props.id, children: props.label }), props.overridden
                        ? (_jsxs("span", { className: fieldsCss.badges, children: [_jsx("span", { className: fieldsCss.badge, children: props.overriddenLabel }), _jsx("button", { type: "button", className: fieldsCss.reset, disabled: props.disabled, onClick: props.onReset, children: props.resetLabel })] }))
                        : null] }), _jsx("input", { id: props.id, className: props.invalid ? fieldsCss.inputInvalid : fieldsCss.input, type: "text", inputMode: "numeric", ...props.invalid ? { 'aria-invalid': true } : {}, value: props.text, disabled: props.disabled, onChange: (event) => { props.onEdit(event.target.value); } }), _jsx("p", { className: props.invalid ? fieldsCss.invalid : fieldsCss.hint, children: props.invalid ? props.invalidLabel : props.hint })] }));
}
//# sourceMappingURL=BetterSidebarSettingsCard.js.map