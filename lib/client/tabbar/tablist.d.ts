import type { ReactNode } from 'react';
export interface TabListTab {
    id: string;
    /** Already-resolved label. */
    label: string;
    icon: ReactNode;
}
export interface TabListProps {
    /** Ordered tabs snapshot. */
    tabs: readonly TabListTab[];
    activeId: string | undefined;
    onSelect(id: string): void;
    /** aria-label for the list. */
    label: string;
}
/** Stable ids shared by the tab buttons and the tab panel. */
export declare const tabPanelId: (id: string) => string;
export declare const tabButtonId: (id: string) => string;
export declare function TabList({ tabs, activeId, onSelect, label }: TabListProps): ReactNode;
//# sourceMappingURL=tablist.d.ts.map