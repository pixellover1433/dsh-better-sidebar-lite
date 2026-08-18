import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { BetterSidebarRpc } from '../../rpc-client.ts';
import type { TabDef } from '../../tab-registry/contract.ts';
import type { ExplorerOpenFileEmitter } from '../explorer/events.ts';
export interface CreateGitTabDefApi {
    rpc: BetterSidebarRpc;
    /** Open-file emitter; status rows emit into it so the shared modal opens files. */
    emitter: ExplorerOpenFileEmitter;
}
export declare function createGitTabDef(ctx: ClientContext, api: CreateGitTabDefApi): TabDef;
//# sourceMappingURL=tab-def.d.ts.map