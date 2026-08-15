import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { ConnectionRpcHandler, HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, inject, name } from '../../src/host/index.ts'
import { CHANNEL, Endpoints } from '../../src/contract/index.ts'

interface Captured {
  channel: string | undefined;
  authority: string | undefined;
  handler: ConnectionRpcHandler | undefined;
}

function fakeConnection(): HostConnectionHandle & { captured: Captured } {
  const captured: Captured = { channel: undefined, authority: undefined, handler: undefined }
  const rpc = {
    handle: (channel: string, handler: ConnectionRpcHandler, opts: { authority: string }) => {
      captured.channel = channel
      captured.authority = opts.authority;
      captured.handler = handler;
      return async () => { if (captured.handler === handler) captured.handler = undefined }
    },
  } as unknown as HostConnectionHandle['rpc']
  return { rpc, captured }
}

describe('host plugin wiring', () => {
  let ctx: Context
  let connection: ReturnType<typeof fakeConnection>;
  let dir: string;

  beforeEach(async () => {
    ctx = new Context()
    connection = fakeConnection()
    dir = await mkdtemp(join(tmpdir(), 'bslite-wire-'));
    ctx.provide('connection', connection);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('registers the channel with loopback authority and correct name/inject', () => {
    expect(name).toBe('dsh-better-sidebar-lite');
    expect(inject).toEqual(['connection']);
  });

  it('applies and captures the /better-sidebar handler', async () => {
    apply(ctx, {});
    await vi.waitFor(() => {
      expect(connection.captured.handler).toBeTruthy();
    });
    expect(connection.captured.channel).toBe(CHANNEL);
    expect(connection.captured.authority).toBe('loopback');
  });

  it('serves explorer/list in the RPC value slot', async () => {
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    const result = await handler(Endpoints.explorerList, { path: dir }, new AbortController().signal);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // ADR-002: the value slot always carries the SidebarResult envelope —
      // success unwraps on the client facade, never on the wire.
      const envelope = result.value as { ok: boolean; value?: { path: string; truncated: boolean } };
      expect(envelope.ok).toBe(true);
      expect(envelope.value).toMatchObject({ path: dir, truncated: false });
    }
  });

  it('rides a domain error for a bad explorer root in the value slot', async () => {
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    const result = await handler(Endpoints.explorerList, { path: 'relative' }, new AbortController().signal);
    expect(result.ok).toBe(true); // transport success
    if (result.ok && typeof result.value === 'object' && result.value !== null && 'error' in result.value) {
      expect((result.value as { error: { code: string } }).error.code).toBe('param-invalid');
    } else {
      throw new Error('expected a SidebarResult failure');
    }
  });

  it('maps a cancelled git call to the RPC error slot code cancelled', async () => {
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    const ctrl = new AbortController();
    ctrl.abort(); // already aborted -> rev-parse path returns cancelled immediately
    const result = await handler(Endpoints.gitStatus, { path: dir }, ctrl.signal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('cancelled');
  });

  it('rejects an unknown endpoint as bad-request', async () => {
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    const result = await handler('does/not-exist', {}, new AbortController().signal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('bad-request');
  });

  it('rejects a malformed payload as bad-request', async () => {
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    const result = await handler(Endpoints.gitStatus, { nope: 1 }, new AbortController().signal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('bad-request');
  });
  it('accepts git/commit with an empty files list (commit what is staged)', async () => {
    // Regression: the payload the UI sends when "include all" is off carries
    // files: []. The guard must NOT reject that as malformed — it should reach
    // the service, which reports not-a-repo (dir is not a git repo) instead.
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    const result = await handler(Endpoints.gitCommit, { path: dir, message: 'test', files: [] }, new AbortController().signal);
    expect(result.ok).toBe(true); // transport ok; the value slot carries the failure
    if (result.ok && typeof result.value === 'object' && result.value !== null && 'error' in result.value) {
      expect((result.value as { error: { code: string } }).error.code).toBe('not-a-repo');
    } else {
      throw new Error('expected a SidebarResult failure surfaced in the value slot');
    }
  });

  it('rejects a malformed git/commit payload as bad-request', async () => {
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    const result = await handler(Endpoints.gitCommit, { path: dir, message: '   ' }, new AbortController().signal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('bad-request');
  });

  it('rejects a malformed git/discard payload as bad-request', async () => {
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    const result = await handler(Endpoints.gitDiscard, { path: dir, files: ['../escape'] }, new AbortController().signal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('bad-request');
  });
})