import type { BetterSidebarTabRegistry, TabDef, TabID } from './contract.ts';
export declare class TabRegistryService implements BetterSidebarTabRegistry {
    private readonly entries;
    private readonly listeners;
    /** Desired active id from storage; settled against live entries lazily. */
    private desiredActive;
    private activeId;
    private nextRegistrationIndex;
    get active(): TabID | undefined;
    register(def: TabDef): () => void;
    unregister(id: TabID): void;
    select(id: TabID): boolean;
    ids(): readonly TabID[];
    get(id: TabID): TabDef | undefined;
    subscribe(fn: () => void): () => void;
    /**
     * Keep the active tab valid. With an explicit (or restored) preference the
     * desired id wins once registered; without one, the active tab follows
     * sort order at every structural change, so a later-registered tab with a
     * lower order takes over the default (explorer beats git regardless of
     * registration order).
     */
    private persistActive;
    private notify;
}
//# sourceMappingURL=service.d.ts.map