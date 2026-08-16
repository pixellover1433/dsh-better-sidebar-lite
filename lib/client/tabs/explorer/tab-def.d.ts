import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { BetterSidebarRpc } from '../../rpc-client.ts';
import type { TabDef } from '../../tab-registry/contract.ts';
import type { ExplorerOpenFileEmitter } from './events.ts';
export declare function createExplorerTabDef(ctx: ClientContext, api: {
    rpc: BetterSidebarRpc;
    emitter: ExplorerOpenFileEmitter;
}): TabDef;
//# sourceMappingURL=tab-def.d.ts.map