/**
 * Presentational tab panel (ADR-003, D7 §7.2): role=tabpanel + aria-labelledby
 * linking to its tab button; renders the active tab's content. Pure.
 */
import type { ReactNode } from 'react';
export interface TabPanelProps {
    /** Panel id (also the tab button's aria-controls target). */
    id: string;
    /** The owning tab button's id (aria-labelledby). */
    labelledBy: string;
    children: ReactNode;
}
export declare function TabPanel({ id, labelledBy, children }: TabPanelProps): ReactNode;
//# sourceMappingURL=tabpanel.d.ts.map