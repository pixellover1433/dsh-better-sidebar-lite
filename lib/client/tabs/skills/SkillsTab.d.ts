import type { SkillEntry } from '../../../contract/skills.ts';
import type { BetterSidebarRpc } from '../../rpc-client.ts';
import type { SkillsKey } from './locales.ts';
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