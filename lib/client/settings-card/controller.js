import { SETTING_RANGES } from "../../contract/settings.js";
/** The fields this card edits, in display order. */
export const CARD_FIELDS = [
    'explorerPollMs',
    'explorerDebounceMs',
    'gitPollMs',
    'gitDebounceMs',
    'skillsPollMs',
];
function formatNumber(value) {
    return typeof value === 'number' ? String(value) : '';
}
/** Whether a draft is a number the field's host schema accepts (finite, in range). */
function validNumber(field, text) {
    const trimmed = text.trim();
    if (trimmed === '')
        return false; // empty means clear, handled separately
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed))
        return false;
    const range = SETTING_RANGES[field];
    return parsed >= range.min && parsed <= range.max;
}
function isOverridden(user, field) {
    return typeof user === 'object' && user !== null && Object.hasOwn(user, field);
}
export class SidebarSettingsCardController {
    scope;
    staged = new Map();
    listeners = new Set();
    saving = false;
    failed = false;
    current;
    constructor(scope) {
        this.scope = scope;
        this.current = this.project();
        this.scope.subscribe(() => {
            this.current = this.project();
            this.emit();
        });
    }
    /** The observable the card's `useSettingsCard` hook reads. */
    observable() {
        return {
            getSnapshot: () => this.current,
            subscribe: (fn) => {
                this.listeners.add(fn);
                return () => { this.listeners.delete(fn); };
            },
        };
    }
    /** Actions bound to this controller. */
    actions() {
        return {
            edit: (field, text) => { this.stage(field, { text, clear: false }); },
            resetField: (field) => {
                const base = this.baseValue(field);
                const fallback = this.sectionValue(field);
                this.stage(field, { text: formatNumber(base ?? fallback), clear: true });
            },
            save: () => { void this.save(); },
            discard: () => {
                if (this.staged.size === 0 && !this.failed)
                    return;
                this.staged.clear();
                this.failed = false;
                this.current = this.project();
                this.emit();
            },
        };
    }
    project() {
        const snapshot = this.scope.getSnapshot();
        return {
            available: snapshot.status === 'ready',
            writable: snapshot.writable,
            saving: this.saving,
            failed: this.failed,
            dirty: this.staged.size > 0,
            invalid: CARD_FIELDS.some(field => this.readField(field).invalid),
            fields: Object.fromEntries(CARD_FIELDS.map(field => [field, this.readField(field)])),
        };
    }
    readField(field) {
        const name = field;
        const entry = this.staged.get(name);
        const snapshot = this.scope.getSnapshot();
        if (entry === undefined) {
            return {
                text: formatNumber(this.sectionValue(name)),
                overridden: isOverridden(snapshot.user, name),
                invalid: false,
            };
        }
        if (entry.clear)
            return { text: entry.text, overridden: false, invalid: false };
        const valid = validNumber(name, entry.text);
        return { text: entry.text, overridden: valid, invalid: !valid };
    }
    sectionValue(field) {
        const snapshot = this.scope.getSnapshot();
        return snapshot.value?.[field];
    }
    baseValue(field) {
        const snapshot = this.scope.getSnapshot();
        return snapshot.base?.[field];
    }
    stage(field, edit) {
        this.staged.set(field, edit);
        this.failed = false;
        this.current = this.project();
        this.emit();
    }
    async save() {
        const writes = [];
        for (const field of CARD_FIELDS) {
            const name = field;
            const entry = this.staged.get(name);
            if (entry === undefined)
                continue;
            if (entry.clear) {
                writes.push({ field: name, expected: undefined, clear: true, run: () => this.scope.unset(name) });
                continue;
            }
            // A draft outside the field's accepted range blocks the save (the Save
            // button is disabled while invalid); never send it to the Host.
            if (!validNumber(name, entry.text))
                continue;
            const parsed = Number(entry.text.trim());
            writes.push({ field: name, expected: parsed, clear: false, run: () => this.scope.set(name, parsed) });
        }
        if (writes.length === 0 || this.saving)
            return;
        this.saving = true;
        this.failed = false;
        this.current = this.project();
        this.emit();
        let landedAll = true;
        try {
            // The Host is authoritative on whether a write landed. One failed write
            // keeps every remaining draft so the card never silently reverts to the
            // served default for a value the user asked for.
            for (const write of writes) {
                await write.run();
                const snapshot = this.scope.getSnapshot();
                const value = snapshot.value?.[write.field];
                const user = snapshot.user;
                const landed = write.clear
                    ? !(user !== undefined && Object.hasOwn(user, write.field))
                    : value === write.expected;
                if (!landed)
                    landedAll = false;
            }
        }
        catch {
            landedAll = false;
        }
        finally {
            if (landedAll)
                this.staged.clear();
            this.saving = false;
            this.failed = !landedAll;
            this.current = this.project();
            this.emit();
        }
    }
    emit() {
        for (const fn of Array.from(this.listeners))
            fn();
    }
}
//# sourceMappingURL=controller.js.map