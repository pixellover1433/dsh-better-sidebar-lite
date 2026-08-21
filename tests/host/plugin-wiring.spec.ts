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

  it('serves explorer/stamp in the RPC value slot', async () => {
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    const result = await handler(Endpoints.explorerStamp, { path: dir, dirs: [dir] }, new AbortController().signal);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const envelope = result.value as { ok: boolean; value?: { path: string; stamps: Record<string, unknown> } };
      expect(envelope.ok).toBe(true);
      expect(envelope.value?.path).toBe(dir);
      expect(typeof envelope.value?.stamps[dir]).toBe('number');
    }
  });

  it('rejects explorer/stamp with an empty dirs list as bad-request', async () => {
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    const result = await handler(Endpoints.explorerStamp, { path: dir, dirs: [] }, new AbortController().signal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('bad-request');
  });

  it('rides a not-found root for explorer/stamp in the value slot', async () => {
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    const missing = join(dir, 'missing');
    const result = await handler(Endpoints.explorerStamp, { path: missing, dirs: [missing] }, new AbortController().signal);
    expect(result.ok).toBe(true); // transport success; the value slot carries the failure
    if (result.ok && typeof result.value === 'object' && result.value !== null && 'error' in result.value) {
      expect((result.value as { error: { code: string } }).error.code).toBe('not-found');
    } else {
      throw new Error('expected a SidebarResult failure');
    }
  });

  it('stamps a dir outside the root undefined', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'bslite-wire-out-'));
    try {
      apply(ctx, {});
      await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
      const handler = connection.captured.handler!;
      const result = await handler(Endpoints.explorerStamp, { path: dir, dirs: [dir, outside] }, new AbortController().signal);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const envelope = result.value as { ok: boolean; value?: { stamps: Record<string, unknown> } };
        expect(envelope.ok).toBe(true);
        expect(envelope.value?.stamps[dir]).toBeTypeOf('number');
        expect(envelope.value?.stamps[outside]).toBeUndefined();
      }
    } finally {
      await rm(outside, { recursive: true, force: true });
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

  it('rejects a malformed git/diff payload as bad-request', async () => {
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    const result = await handler(Endpoints.gitDiff, { path: dir, file: '../escape', base: 'index' }, new AbortController().signal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('bad-request');
  });

  it('rejects a malformed git/commit-file-diff payload as bad-request', async () => {
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    // An unsafe file path must be rejected at the trust boundary.
    const result = await handler(Endpoints.gitCommitFileDiff, { path: dir, hash: 'deadbeef', file: '../escape' }, new AbortController().signal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('bad-request');
  });

  it('rides a not-a-repo failure for git/commit-file-diff with a valid payload', async () => {
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    // dir is a plain (non-git) directory; a well-formed payload reaches the
    // service, which reports not-a-repo in the value slot.
    const result = await handler(Endpoints.gitCommitFileDiff, { path: dir, hash: 'deadbeef', file: 'a.txt' }, new AbortController().signal);
    expect(result.ok).toBe(true);
    if (result.ok && typeof result.value === 'object' && result.value !== null && 'error' in result.value) {
      expect((result.value as { error: { code: string } }).error.code).toBe('not-a-repo');
    } else {
      throw new Error('expected a SidebarResult failure');
    }
  });

  it('serves skills/list with an empty catalog plus a warning when the skills seam is absent', async () => {
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    // The bare test Context has no skills/agents/presets seams, so the scoped
    // resolution falls through to the host registry, which is also absent. The
    // host never throws for a listing failure: it returns a SUCCESS value whose
    // `warning` string carries the diagnostic detail (which survives JSON).
    const result = await handler(Endpoints.skillsList, { cwd: dir }, new AbortController().signal);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const envelope = result.value as { ok: boolean; value?: { skills: unknown[]; warning?: string } };
      expect(envelope.ok).toBe(true);
      expect(envelope.value).toMatchObject({ skills: [] });
      expect(typeof envelope.value?.warning).toBe('string');
      expect(envelope.value?.warning).toContain('skills/list failed:');
    }
  });

  it('rejects a malformed skills/list payload as bad-request', async () => {
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    const result = await handler(Endpoints.skillsList, { nope: 1 }, new AbortController().signal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('bad-request');
  });

  it('rejects a skills/list payload with a non-string cwd', async () => {
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    const result = await handler(Endpoints.skillsList, { cwd: 123 }, new AbortController().signal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('bad-request');
  });

  it('rejects a skills/list payload with a non-string sessionId', async () => {
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    const result = await handler(Endpoints.skillsList, { sessionId: 5 }, new AbortController().signal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('bad-request');
  });

  it('serves skills/detail as not-found when the skills seam is absent', async () => {
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    // The bare test Context has no skills/agents/presets seams, so the scoped
    // resolution falls through to the host registry, which is also absent. As
    // with list, the host never throws: it returns a SUCCESS value whose
    // `found` is false and whose `warning` carries the diagnostic detail.
    const result = await handler(Endpoints.skillsDetail, { name: 'alpha', cwd: dir }, new AbortController().signal);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const envelope = result.value as { ok: boolean; value?: { found: boolean; references: unknown[]; warning?: string } };
      expect(envelope.ok).toBe(true);
      expect(envelope.value?.found).toBe(false);
      expect(envelope.value?.references).toEqual([]);
      expect(typeof envelope.value?.warning).toBe('string');
      expect(envelope.value?.warning).toContain('skills/detail failed:');
    }
  });

  it('rejects a malformed skills/detail payload as bad-request', async () => {
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    // A missing name is invalid: the guard requires a non-empty string name.
    const result = await handler(Endpoints.skillsDetail, { cwd: dir }, new AbortController().signal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('bad-request');
  });

  it('rejects a skills/detail payload with a non-string name as bad-request', async () => {
    apply(ctx, {});
    await vi.waitFor(() => expect(connection.captured.handler).toBeTruthy());
    const handler = connection.captured.handler!;
    const result = await handler(Endpoints.skillsDetail, { name: 5, cwd: dir }, new AbortController().signal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('bad-request');
  });
})