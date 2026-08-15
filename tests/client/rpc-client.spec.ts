/**
 * BetterSidebarRpc facade unit tests (ADR-002, d8 §4.2): the transport-level
 * behavior of createBetterSidebarRpc over a fake connection handle — success
 * envelope, value-slot domain errors, RPC-error cancellation, rejected calls,
 * and caller-aborted signals.
 */
import { describe, expect, it } from 'vitest'
import { createBetterSidebarRpc } from '../../src/client/rpc-client.ts'
import type { SidebarResult } from '../../src/contract/errors.ts'
import type { RpcError, RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'

type CallResult = RpcResult<unknown>

/** A connection handle whose rpc.call is fully under the test's control. */
function fakeHandle(resolver: () => CallResult | Promise<CallResult>): ConnectionHandle {
  return {
    api: {} as never,
    isLoopback: true,
    hostDescription: {
      getSnapshot: () => undefined,
      subscribe: () => () => {},
    },
    rpc: {
      call: async (_channel: string, _endpoint: string, _payload: unknown, _signal?: AbortSignal) => resolver(),
    },
    start: () => ({ stop() {} }),
  }
}

const cancelledError: RpcError = { code: 'cancelled', message: 'superseded', details: {} }

describe('createBetterSidebarRpc', () => {
  it('returns the value envelope on success', async () => {
    const rpc = createBetterSidebarRpc(fakeHandle(() => ({ ok: true, value: { ok: true, value: { path: '/x', entries: [], truncated: false } } })))
    const res = await rpc.call('explorer/list', { path: '/x' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.path).toBe('/x')
    } else {
      throw new Error('expected success')
    }
  })

  it('passes through a domain error that rides in the value slot', async () => {
    const domain: RpcResult<{ ok: false; error: { code: 'not-found'; message: string; path: string } }> = {
      ok: true,
      value: { ok: false, error: { code: 'not-found', message: 'gone', path: '/gone' } },
    }
    const rpc = createBetterSidebarRpc(fakeHandle(() => domain as CallResult))
    const res = await rpc.call('explorer/list', { path: '/gone' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('not-found')
  })

  it('maps an RPC-error-slot cancellation to a plugin cancelled error', async () => {
    const rpc = createBetterSidebarRpc(fakeHandle(() => ({ ok: false, error: cancelledError })))
    const res = await rpc.call('git/status', { path: '/repo' })
    expect(res).toEqual<SidebarResult<unknown>>({ ok: false, error: { code: 'cancelled', message: 'superseded' } })
  })

  it('maps a rejected rpc.call to an internal transport error', async () => {
    const rpc = createBetterSidebarRpc(fakeHandle(() => { throw new Error('boom') }))
    const res = await rpc.call('git/status', { path: '/repo' })
    expect(res).toEqual({ ok: false, error: { code: 'internal', message: 'host unavailable' } })
  })

  it('maps a rejected call on an aborted signal to cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const rpc = createBetterSidebarRpc(fakeHandle(() => { throw new Error('abort') }))
    const res = await rpc.call('git/status', { path: '/repo' }, { signal: controller.signal })
    expect(res).toEqual({ ok: false, error: { code: 'cancelled', message: 'request superseded' } })
  })
})