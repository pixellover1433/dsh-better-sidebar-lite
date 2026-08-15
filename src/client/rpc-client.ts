/**
 * Browser RPC facade: the ONLY way client code talks to the host channel
 * (ADR-001/002). Tabs never import @deepseek-ai/dsh-client-connection directly.
 */
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { SidebarError, SidebarResult } from '../contract/errors.ts'
import type { BetterSidebarEndpoint, BetterSidebarReqMap, BetterSidebarResMap } from '../contract/rpc.ts'
import { CHANNEL } from '../contract/versions.ts'

/** Typed, transport-agnostic client face over the generic RPC channel. */
export interface BetterSidebarRpc {
  call<E extends BetterSidebarEndpoint>(
    endpoint: E,
    payload: BetterSidebarReqMap[E],
    opts?: { signal?: AbortSignal },
  ): Promise<SidebarResult<BetterSidebarResMap[E]>>
}

/** Transport-level failure the connection layer reported (ADR-002): the
 * UI-facing message is a stable, localized-agnostic string; the underlying
 * error text goes to the console for diagnostics. */
function transportError(cause: unknown): SidebarError {
  console.error('better-sidebar: host transport failure', cause)
  return { code: 'internal', message: 'host unavailable' }
}

/**
 * Build the facade over the connection handle provided by dsh.
 * Rejected calls (dead transport, HTTP error) map to a typed transport error;
 * domain errors arrive in the value slot from the host (ADR-002).
 */
export function createBetterSidebarRpc(connection: ConnectionHandle): BetterSidebarRpc {
  return new BetterSidebarRpcClient(connection)
}

class BetterSidebarRpcClient implements BetterSidebarRpc {
  constructor(private readonly connection: ConnectionHandle) {}

  async call<E extends BetterSidebarEndpoint>(
    endpoint: E,
    payload: BetterSidebarReqMap[E],
    opts?: { signal?: AbortSignal },
  ): Promise<SidebarResult<BetterSidebarResMap[E]>> {
    let result
    try {
      result = await this.connection.rpc.call(CHANNEL, endpoint, payload, opts?.signal)
    } catch (error) {
      // Aborted by the caller is not a failure state for the caller.
      if (opts?.signal?.aborted === true) return { ok: false, error: { code: 'cancelled', message: 'request superseded' } }
      return { ok: false, error: transportError(error instanceof Error ? error.message : String(error)) }
    }
    if (!result.ok) {
      if (result.error.code === 'cancelled') return { ok: false, error: { code: 'cancelled', message: result.error.message } }
      // The host rejects malformed payloads/unknown endpoints with
      // bad-request; surface that as param-invalid, not a transport failure.
      if (result.error.code === 'bad-request') {
        // Diagnostic: a trust-boundary rejection should reveal what was sent.
        console.warn('better-sidebar: bad-request', endpoint, JSON.stringify(payload), result.error.message)
        return { ok: false, error: { code: 'param-invalid', message: result.error.message } }
      }
      return { ok: false, error: transportError(result.error.message) }
    }
    // The value slot carries SidebarResult<T> (ADR-002).
    return result.value as SidebarResult<BetterSidebarResMap[E]>
  }
}