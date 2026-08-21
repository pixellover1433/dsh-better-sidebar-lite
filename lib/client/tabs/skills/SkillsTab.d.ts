import type { SkillEntry } from '../../../contract/skills.ts';
import type { BetterSidebarRpc } from '../../rpc-client.ts';
import type { ExplorerOpenFileEmitter } from '../explorer/events.ts';
import type { SkillsKey } from './locales.ts';
export interface SkillsTabProps {
    rpc: BetterSidebarRpc;
    /** Open-file emitter; detail reference rows emit into it so the shared modal opens files. */
    emitter: ExplorerOpenFileEmitter;
    /** Bound skills-namespace translate. */
    t: (key: SkillsKey, params?: Record<string, unknown>) => string;
}
/** Derived model/user invocation status of one skill. */
export type SkillsStatus = 'enabled' | 'disabled' | 'modelOnly' | 'userOnly';
export declare function skillStatus(entry: SkillEntry): SkillsStatus;
/** Localized key per status, and the CSS class riding alongside. */
export declare const STATUS_KEY: Record<SkillsStatus, SkillsKey>;
export declare function SkillsTab({ rpc, emitter, t }: SkillsTabProps): import("react").JSX.Element;
//# sourceMappingURL=SkillsTab.d.ts.map