/**
 * Plugin configuration card controller (ADR-004 §3 amendment). Bridges the
 * bound plugin settings scope onto a staged form the card renders: edits are
 * staged until Save (a durable, revision-fenced document mutation), Reset
 * stages a clear so a field re-inherits the served default, Discard drops
 * drafts, and a rejected or failed latest save keeps the drafts for the user
 * to correct (the Host is the only authority on acceptance).
 *
 * It carries no runtime import from a dsh package (the client bundle purity
 * gate forbids cross-plugin value imports): the typed scope arrives injected
 * and only its type is imported. The observable it exposes is a minimal local
 * store satisfying `getSnapshot` + `subscribe`.
 */
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import type { BetterSidebarSettings } from '../../contract/settings.ts';
/** The fields this card edits, in display order. */
export declare const CARD_FIELDS: readonly (keyof BetterSidebarSettings)[];
/** One field as the card's control renders it. */
export interface CardFieldState {
    text: string;
    overridden: boolean;
    invalid: boolean;
}
/** Card-level state every control reads. */
export interface SidebarCardState {
    available: boolean;
    writable: boolean;
    dirty: boolean;
    invalid: boolean;
    saving: boolean;
    failed: boolean;
    fields: Record<string, CardFieldState>;
}
/** The write actions the card exposes. */
export interface SidebarCardActions {
    edit: (field: string, text: string) => void;
    resetField: (field: string) => void;
    save: () => void;
    discard: () => void;
}
/** Minimal observable the card's selector hook reads (no dsh runtime import). */
export interface CardObservable<T> {
    getSnapshot(): T;
    subscribe(fn: () => void): () => void;
}
export declare class SidebarSettingsCardController {
    private readonly scope;
    private readonly staged;
    private readonly listeners;
    private saving;
    private failed;
    private current;
    constructor(scope: SettingsScope<BetterSidebarSettings>);
    /** The observable the card's `useSettingsCard` hook reads. */
    observable(): CardObservable<SidebarCardState>;
    /** Actions bound to this controller. */
    actions(): SidebarCardActions;
    private project;
    private readField;
    private sectionValue;
    private baseValue;
    private stage;
    private save;
    private emit;
}
//# sourceMappingURL=controller.d.ts.map