/**
 * Tab registry public contract (ADR-003): the extension point third-party
 * plugins use to contribute tabs to the right sidebar.
 */
import type { ReactNode } from 'react';
export type TabID = string;
export interface TabDef {
    /** Stable unique id; duplicate registration throws. */
    id: TabID;
    /** Lower sorts first; default 1000. */
    order?: number;
    /** Tab title; a function allows locale-aware resolution. */
    label: string | (() => string);
    /** Inline-SVG icon element (icons.tsx). */
    icon: ReactNode;
    /** Optional live badge (e.g. dirty count); undefined hides the badge. */
    badge?: () => number | string | undefined;
    /** Renders the active-tab panel content. */
    renderPanel: () => ReactNode;
}
export interface BetterSidebarTabRegistry {
    /** Register a tab; returns an idempotent disposer. */
    register(def: TabDef): () => void;
    /** Remove a tab; no-op when absent. */
    unregister(id: TabID): void;
    /** Currently active tab id, undefined when no tabs remain. */
    active: TabID | undefined;
    /** Activate a tab; false when the id is unknown. */
    select(id: TabID): boolean;
    /** Ordered snapshot: (order, registration index). */
    ids(): readonly TabID[];
    get(id: TabID): TabDef | undefined;
    /** Subscribe to registry changes; returns unsubscribe. */
    subscribe(fn: () => void): () => void;
}
/** Thrown synchronously by register() on a duplicate id. */
export declare class TabRegisterError extends Error {
    readonly id: TabID;
    constructor(id: TabID);
}
//# sourceMappingURL=contract.d.ts.map