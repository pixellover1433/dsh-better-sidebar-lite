/**
 * Tab registry implementation (ADR-003): the ordered, observe-able tab list
 * behind ctx.betterSidebar.tabs. Holds sorted-by-(order, registration index)
 * entries, an active-tab with localStorage persistence, and a plain
 * getSnapshot/subscribe face that keeps the dock renderable without any
 * runtime dependency.
 */
import { TabRegisterError } from "./contract.js";
/** Persisted active-tab key (ADR-003, D4 §5). */
const ACTIVE_STORAGE_KEY = 'dsh.betterSidebar.activeTab';
/** Default sort order for tabs that declare no explicit order. */
const DEFAULT_ORDER = 1000;
/** Read a persisted tab id; corrupt/unavailable storage yields undefined. */
function readPersistedActive() {
    if (typeof localStorage === 'undefined')
        return undefined;
    try {
        const raw = localStorage.getItem(ACTIVE_STORAGE_KEY);
        return raw === null || raw === '' ? undefined : raw;
    }
    catch {
        return undefined;
    }
}
/** Persist the active tab; write failures are not the dock's problem. */
function writePersistedActive(id) {
    if (typeof localStorage === 'undefined')
        return;
    try {
        if (id === undefined)
            localStorage.removeItem(ACTIVE_STORAGE_KEY);
        else
            localStorage.setItem(ACTIVE_STORAGE_KEY, id);
    }
    catch {
        // quota/denied: geometry stays in-memory only
    }
}
/** Sort two entries by (order, registration index) then registry order. */
function byOrder(a, b) {
    const ao = a.def.order ?? DEFAULT_ORDER;
    const bo = b.def.order ?? DEFAULT_ORDER;
    if (ao !== bo)
        return ao - bo;
    return a.registrationIndex - b.registrationIndex;
}
export class TabRegistryService {
    entries = new Map();
    listeners = new Set();
    /** Desired active id from storage; settled against live entries lazily. */
    desiredActive = readPersistedActive();
    activeId;
    nextRegistrationIndex = 0;
    get active() {
        return this.activeId;
    }
    register(def) {
        if (this.entries.has(def.id))
            throw new TabRegisterError(def.id);
        this.entries.set(def.id, { def, registrationIndex: this.nextRegistrationIndex++ });
        this.persistActive();
        writePersistedActive(this.activeId);
        this.notify();
        let disposed = false;
        return () => {
            if (disposed)
                return;
            disposed = true;
            this.unregister(def.id);
        };
    }
    unregister(id) {
        if (!this.entries.delete(id))
            return;
        this.persistActive();
        writePersistedActive(this.activeId);
        this.notify();
    }
    select(id) {
        if (!this.entries.has(id))
            return false;
        this.activeId = id;
        this.desiredActive = id;
        writePersistedActive(id);
        this.notify();
        return true;
    }
    ids() {
        return [...this.entries.values()].sort(byOrder).map(e => e.def.id);
    }
    get(id) {
        return this.entries.get(id)?.def;
    }
    subscribe(fn) {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    }
    /**
     * Keep the active tab valid. With an explicit (or restored) preference the
     * desired id wins once registered; without one, the active tab follows
     * sort order at every structural change, so a later-registered tab with a
     * lower order takes over the default (explorer beats git regardless of
     * registration order).
     */
    persistActive() {
        if (this.entries.size === 0) {
            this.activeId = undefined;
            return;
        }
        if (this.desiredActive !== undefined) {
            if (this.entries.has(this.desiredActive)) {
                this.activeId = this.desiredActive;
                return;
            }
            // Desired id not registered yet: keep the current valid active id.
            if (this.activeId !== undefined && this.entries.has(this.activeId))
                return;
        }
        this.activeId = [...this.entries.values()].sort(byOrder)[0]?.def.id;
    }
    notify() {
        for (const fn of Array.from(this.listeners))
            fn();
    }
}
//# sourceMappingURL=service.js.map