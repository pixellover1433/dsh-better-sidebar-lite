/**
 * Left-sidebar footer toggle (ADR-003): restores/hides the right dock from
 * dsh's own left column, so the affordance NEVER overlaps web content (the
 * right 'details' column cannot reserve a collapsed width — only 0 or
 * [300, 520]). Dispatches the same TOGGLE_EVENT the global Ctrl/Cmd+Shift+B
 * shortcut uses; DockRoot listens and flips. Icon-only in the 56px rail,
 * icon + label in the wide sidebar.
 */
import type { ReactNode } from 'react';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
/** The footer entry component: receives the sidebar's { wide } owner share. */
export declare function createSidebarToggleAction(t: TranslateNS<'betterSidebar.dock'>): (props: {
    wide: boolean;
}) => ReactNode;
//# sourceMappingURL=footer-toggle.d.ts.map