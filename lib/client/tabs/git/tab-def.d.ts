import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { BetterSidebarRpc } from '../../rpc-client.ts';
import type { TabDef } from '../../tab-registry/contract.ts';
export interface CreateGitTabDefApi {
    rpc: BetterSidebarRpc;
}
export declare function createGitTabDef(ctx: ClientContext, api: CreateGitTabDefApi): TabDef;
//# sourceMappingURL=tab-def.d.ts.map