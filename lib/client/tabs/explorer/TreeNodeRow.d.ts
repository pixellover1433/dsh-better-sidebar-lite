/**
 * TreeNodeRow — one visible explorer tree row (D2 §9). Presentational: it
 * renders an entry at a depth and forwards user interactions via handlers; the
 * panel owns tree semantics (roving tabindex, keyboard, selection). The caret
 * toggles without moving selection; row click selects+focuses; double-click on
 * a file opens (see D2 §10).
 */
import type { Ref } from 'react';
import type { ExplorerEntry } from '../../../contract/explorer.ts';
export interface TreeNodeRowProps {
    entry: ExplorerEntry;
    depth: number;
    expanded: boolean;
    selected: boolean;
    focused: boolean;
    /** 'error' renders the inline retry affordance for a failed directory list. */
    loadState: 'idle' | 'loading' | 'error' | 'loaded';
    /** Localized label for the inline retry button. */
    retryLabel: string;
    /** Localized caret labels (aria only). */
    expandLabel: string;
    collapseLabel: string;
    /** Failed-listing message rendered beside the retry affordance (S8). */
    errorMessage: string | undefined;
    /** Toggle expansion without moving selection (caret click). */
    onToggle: () => void;
    /** Select + focus this row (row click). */
    onActivate: () => void;
    /** Open-file event (double-click on a file). */
    onOpen: () => void;
    /** Retry a failed directory listing. */
    onRetry: () => void;
    /** Forwarded to the row element for roving-tabindex focus management. */
    rowRef: Ref<HTMLDivElement>;
}
export declare function TreeNodeRow(props: TreeNodeRowProps): import("react").JSX.Element;
//# sourceMappingURL=TreeNodeRow.d.ts.map