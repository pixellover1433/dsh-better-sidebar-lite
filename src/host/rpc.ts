/**
 * RPC dispatch for the /better-sidebar channel (ADR-002, D6 §6).
 *
 * Every handler validates its payload with the shared contract guards, then
 * wraps results through toRpcResult. Per ADR-002: typed domain errors ride the
 * RPC VALUE slot inside a SidebarResult (dsh RpcError is a closed union), while
 * pure caller cancellation maps to the RPC error slot code 'cancelled'.
 */
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { ConnectionRpcHandler } from '@deepseek-ai/dsh-client-connection'
import {
  Endpoints,
  isExplorerListRequest,
  isGitCommitDetailRequest,
  isGitCommitRequest,
  isGitDiscardRequest,
  isGitLogRequest,
  isGitStageRequest,
  isGitStatusRequest,
  type SidebarError,
  type SidebarResult,
} from '../contract/index.ts'
import type { ExplorerService } from './explorer.ts'
import type { GitService } from './git.ts'

/** The two service dependencies the dispatch table needs. */
export interface HostServices {
  explorer: ExplorerService
  git: GitService
}

/**
 * Per ADR-002: the RPC value slot ALWAYS carries the SidebarResult envelope —
 * success AND domain failure alike — because the client facade rehydrates
 * SidebarResult<T> from result.value (a raw page there would be misread as a
 * result with ok: undefined). The single exception is genuine caller
 * cancellation, which maps to the RPC error slot code 'cancelled'.
 */
function toRpcResult(sr: SidebarResult<unknown>): RpcResult<unknown> {
  if (!sr.ok && sr.error.code === 'cancelled') {
    return { ok: false, error: { code: 'cancelled', message: sr.error.message, details: {} } }
  }
  return { ok: true, value: sr }
}

function badRequest(message: string): RpcResult<never> {
  return { ok: false, error: { code: 'bad-request', message, details: { issues: [] } } }
}

/**
 * Build the channel handler that the host plugin registers via
 * rpc.handle('/better-sidebar', handler, { authority: 'loopback' }).
 */
export function createChannelHandler(services: HostServices): ConnectionRpcHandler {
  return (endpoint: string, payload: unknown, signal: AbortSignal) =>
    dispatch(services, endpoint, payload, signal)
}

async function dispatch(
  services: HostServices,
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
): Promise<RpcResult<unknown>> {
  switch (endpoint) {
    case Endpoints.explorerList: {
      if (!isExplorerListRequest(payload)) return badRequest('invalid payload for ' + endpoint)
      try {
        const value = await services.explorer.list(payload)
        return toRpcResult({ ok: true, value })
      } catch (e) {
        return toRpcResult({ ok: false, error: e as SidebarError })
      }
    }
    case Endpoints.gitStatus: {
      if (!isGitStatusRequest(payload)) return badRequest('invalid payload for ' + endpoint)
      return toRpcResult(await services.git.status(payload, signal))
    }
    case Endpoints.gitLog: {
      if (!isGitLogRequest(payload)) return badRequest('invalid payload for ' + endpoint)
      return toRpcResult(await services.git.log(payload, signal))
    }
    case Endpoints.gitStage: {
      if (!isGitStageRequest(payload)) return badRequest('invalid payload for ' + endpoint)
      return toRpcResult(await services.git.stage(payload, signal))
    }
    case Endpoints.gitUnstage: {
      if (!isGitStageRequest(payload)) return badRequest('invalid payload for ' + endpoint)
      return toRpcResult(await services.git.unstage(payload, signal))
    }
    case Endpoints.gitCommitDetail: {
      if (!isGitCommitDetailRequest(payload)) {
        // Diagnostic: a trust-boundary rejection is worth knowing what arrived
        // (the browser and host can drift across builds).
        console.warn('better-sidebar: rejected git/commit-detail payload', JSON.stringify(payload))
        return badRequest('invalid payload for ' + endpoint)
      }
      return toRpcResult(await services.git.commitDetail(payload, signal))
    }
    case Endpoints.gitCommit: {
      if (!isGitCommitRequest(payload)) return badRequest('invalid payload for ' + endpoint)
      return toRpcResult(await services.git.commit(payload, signal))
    }
    case Endpoints.gitDiscard: {
      if (!isGitDiscardRequest(payload)) return badRequest('invalid payload for ' + endpoint)
      return toRpcResult(await services.git.discard(payload, signal))
    }
    default:
      return badRequest('unknown endpoint ' + endpoint)
  }
}