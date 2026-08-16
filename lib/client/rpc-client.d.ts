/**
 * Browser RPC facade: the ONLY way client code talks to the host channel
 * (ADR-001/002). Tabs never import @deepseek-ai/dsh-client-connection directly.
 */
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client';
import type { SidebarResult } from '../contract/errors.ts';
import type { BetterSidebarEndpoint, BetterSidebarReqMap, BetterSidebarResMap } from '../contract/rpc.ts';
/** Typed, transport-agnostic client face over the generic RPC channel. */
export interface BetterSidebarRpc {
    call<E extends BetterSidebarEndpoint>(endpoint: E, payload: BetterSidebarReqMap[E], opts?: {
        signal?: AbortSignal;
    }): Promise<SidebarResult<BetterSidebarResMap[E]>>;
}
/**
 * Build the facade over the connection handle provided by dsh.
 * Rejected calls (dead transport, HTTP error) map to a typed transport error;
 * domain errors arrive in the value slot from the host (ADR-002).
 */
export declare function createBetterSidebarRpc(connection: ConnectionHandle): BetterSidebarRpc;
//# sourceMappingURL=rpc-client.d.ts.map