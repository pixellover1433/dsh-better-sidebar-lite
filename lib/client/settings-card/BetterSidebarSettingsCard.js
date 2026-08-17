import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The plugin's configuration card in Settings > Plugins > Plugin configuration
 * (ADR-004 §3 amendment). Renders one compact control per editable field
 * (auto-refresh cadences) over the staged card state, with a Save that writes
 * the staged edits and a Discard/Reset pair. The controls are self-contained —
 * the harness's shared card chrome is not exported — so this card owns its own
 * markup but follows the same staged-write semantics documented for plugin
 * cards: what is on screen is exactly what a save would store, and a field's
 * presence in the raw user layer (not its value) is what marks it overridden.
 */
import { useState } from 'react';
import { CARD_FIELDS } from "./controller.js";
import styles from './settings-card.module.css';
/** Display labels keyed by field (the card's t() resolves these). */
export const FIELD_LABELS = {
    explorerPollMs: 'ExplorerPollMs',
    explorerDebounceMs: 'ExplorerDebounceMs',
    gitPollMs: 'GitPollMs',
    gitDebounceMs: 'GitDebounceMs',
};
export function BetterSidebarSettingsCard(props) {
    const [open, setOpen] = useState(false);
    const state = props.useSettingsCard(s => s);
    if (!state.available)
        return null;
    const blocked = !state.dirty || state.invalid || state.saving;
    return (_jsxs("li", { className: styles.card, children: [_jsxs("button", { type: "button", className: styles.header, "aria-expanded": open, onClick: () => { setOpen(!open); }, children: [_jsxs("span", { className: styles.headText, children: [_jsx("span", { className: styles.name, children: fieldLabel('cardTitle') }), _jsx("span", { className: styles.description, children: fieldLabel('cardDescription') })] }), state.dirty ? _jsx("span", { className: styles.pending, children: fieldLabel('unsaved') }) : null] }), open ? (_jsxs("div", { className: styles.body, children: [!state.writable ? _jsx("p", { className: styles.readOnly, role: "status", children: fieldLabel('readOnly') }) : null, CARD_FIELDS.map(fieldKey => (_jsx(FieldControl, { fieldKey: String(fieldKey), disabled: !state.writable, state: state, edit: props.edit, resetField: props.resetField }, String(fieldKey)))), _jsxs("div", { className: styles.footer, children: [state.failed ? _jsx("p", { className: styles.failed, role: "status", children: fieldLabel('saveFailed') }) : null, _jsx("button", { type: "button", className: styles.discard, disabled: !state.dirty || state.saving, onClick: props.discard, children: fieldLabel('discard') }), _jsx("button", { type: "button", className: styles.save, disabled: blocked, onClick: props.save, children: fieldLabel(state.saving ? 'saving' : 'save') })] })] })) : null] }));
}
function FieldControl(props) {
    const { fieldKey, state, edit, resetField } = props;
    const field = state.fields[fieldKey];
    const id = 'better-sidebar-field-' + fieldKey;
    return (_jsxs("div", { className: styles.field, children: [_jsxs("div", { className: styles.head, children: [_jsx("label", { className: styles.label, htmlFor: id, children: fieldLabel(fieldKey) }), field?.overridden === true ? (_jsxs("span", { className: styles.badges, children: [_jsx("span", { className: styles.badge, children: fieldLabel('overridden') }), _jsx("button", { type: "button", className: styles.reset, disabled: props.disabled, onClick: () => resetField(fieldKey), children: fieldLabel('reset') })] })) : null] }), _jsx("input", { id: id, className: field?.invalid === true ? styles.inputInvalid : styles.input, type: "text", inputMode: "numeric", ...field?.invalid === true ? { 'aria-invalid': true } : {}, value: field?.text ?? '', disabled: props.disabled, onChange: (event) => { edit(fieldKey, event.target.value); } }), field?.invalid === true ? (_jsx("p", { className: styles.invalidText, children: fieldLabel('invalidNumber') })) : null] }));
}
/** Locale-aware label reader (v1: English live labels; localized in a later pass). */
function fieldLabel(key) {
    return FIELD_LABELS[key] ?? key;
}
//# sourceMappingURL=BetterSidebarSettingsCard.js.map