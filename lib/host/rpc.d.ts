import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection';
import type { ExplorerService } from './explorer.ts';
import type { GitService } from './git.ts';
import type { SkillService } from './skills.ts';
/** The service dependencies the dispatch table needs. */
export interface HostServices {
    explorer: ExplorerService;
    git: GitService;
    skills: SkillService;
}
/**
 * Build the channel handler that the host plugin registers via
 * rpc.handle('/better-sidebar', handler, { authority: 'loopback' }).
 */
export declare function createChannelHandler(services: HostServices): ConnectionRpcHandler;
//# sourceMappingURL=rpc.d.ts.map