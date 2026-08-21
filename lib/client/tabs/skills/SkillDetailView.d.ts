import type { BetterSidebarRpc } from '../../rpc-client.ts';
import type { ExplorerOpenFileEmitter } from '../explorer/events.ts';
import type { SkillsKey } from './locales.ts';
export interface SkillDetailViewProps {
    rpc: BetterSidebarRpc;
    /** Open-file emitter; reference rows emit into it so the shared modal opens files. */
    emitter: ExplorerOpenFileEmitter;
    /** Bound skills-namespace translate. */
    t: (key: SkillsKey, params?: Record<string, unknown>) => string;
    /** Kebab-case skill name whose detail to load. */
    skillName: string;
    /** Absolute workspace root (the cwd-sensitivity of skill lookup). */
    root: string;
    /** Active session id; omitted when none resolves (host reads host-global). */
    sessionId: string | undefined;
    /** Clear the parent's selection to return to the catalog. */
    onBack: () => void;
}
export declare function SkillDetailView({ rpc, emitter, t, skillName, root, sessionId, onBack }: SkillDetailViewProps): import("react").JSX.Element;
//# sourceMappingURL=SkillDetailView.d.ts.map