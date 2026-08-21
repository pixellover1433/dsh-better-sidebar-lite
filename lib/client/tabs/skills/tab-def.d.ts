import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { BetterSidebarRpc } from '../../rpc-client.ts';
import type { TabDef } from '../../tab-registry/contract.ts';
import type { ExplorerOpenFileEmitter } from '../explorer/events.ts';
export interface CreateSkillsTabDefApi {
    rpc: BetterSidebarRpc;
    /** Open-file emitter; reference rows emit into it so the shared modal opens files. */
    emitter: ExplorerOpenFileEmitter;
}
export declare function createSkillsTabDef(ctx: ClientContext, api: CreateSkillsTabDefApi): TabDef;
//# sourceMappingURL=tab-def.d.ts.map