import type { SkillEntry } from '../../../contract/skills.ts';
import type { BetterSidebarRpc } from '../../rpc-client.ts';
import type { SkillsKey } from './locales.ts';
/** Fallback auto-refresh cadence. Skills may be injected into the session after
 *  the tab mounts, so we re-poll on an interval (silent) instead of relying on
 *  the single mount fetch. */
export declare const SKILLS_POLL_MS = 5000;
export interface SkillsTabProps {
    rpc: BetterSidebarRpc;
    /** Bound skills-namespace translate. */
    t: (key: SkillsKey, params?: Record<string, unknown>) => string;
}
/** Derived model/user invocation status of one skill. */
export type SkillsStatus = 'enabled' | 'disabled' | 'modelOnly' | 'userOnly';
export declare function skillStatus(entry: SkillEntry): SkillsStatus;
export declare function SkillsTab({ rpc, t }: SkillsTabProps): import("react").JSX.Element;
//# sourceMappingURL=SkillsTab.d.ts.map