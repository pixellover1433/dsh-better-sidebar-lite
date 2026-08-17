import type { BetterSidebarRpc } from '../../rpc-client.ts';
import type { GitKey } from './locales.ts';
/** Fallback poll cadence default (status-only; the log follows a status change). */
export declare const AUTO_REFRESH_STATUS_INTERVAL_MS = 8000;
/**
 * Debounce default for session-activity-triggered auto-refresh. Session frames
 * (and their updatedAt bumps) arrive in bursts around one tool run.
 */
export declare const AUTO_REFRESH_DEBOUNCE_MS = 600;
export interface GitTabProps {
    rpc: BetterSidebarRpc;
    /** Bound git-namespace translate. */
    t: (key: GitKey, params?: Record<string, unknown>) => string;
}
export declare function GitTab({ rpc, t }: GitTabProps): import("react").JSX.Element;
//# sourceMappingURL=git-tab.d.ts.map