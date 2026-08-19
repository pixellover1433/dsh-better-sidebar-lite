/**
 * Skills tab component tests: render <SkillsTab> directly (no DockContext —
 * the skills tab has no workspace/session dependency) with a stub rpc. No dsh
 * test-runtime, no Cordis mount.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SkillEntry } from '../../../../src/contract/skills.ts'
import type { SidebarError, SidebarResult } from '../../../../src/contract/errors.ts'
import { Endpoints, type BetterSidebarEndpoint, type BetterSidebarReqMap, type BetterSidebarResMap } from '../../../../src/contract/rpc.ts'
import type { BetterSidebarRpc } from '../../../../src/client/rpc-client.ts'
import { skillStatus, SkillsTab, type SkillsTabProps } from '../../../../src/client/tabs/skills/SkillsTab.tsx'

/** Locale stub: render keys verbatim so assertions read the raw key. */
const t: SkillsTabProps['t'] = (key) => key

/** Build a fake SkillEntry over defaults. */
function entry(overrides: Partial<SkillEntry> & { name: string }): SkillEntry {
  return {
    description: 'desc',
    invocation: { modelInvocable: true, userInvocable: true },
    source: 'bundled',
    provider: 'p',
    ...overrides,
  }
}

type Handler = (payload: Record<string, unknown>, signal?: AbortSignal) => Promise<SidebarResult<unknown>>

/** In-memory BetterSidebarRpc with a skillsList handler. */
class FakeRpc implements BetterSidebarRpc {
  private handlers = new Map<BetterSidebarEndpoint, Handler>()

  setHandler(endpoint: BetterSidebarEndpoint, handler: Handler): void {
    this.handlers.set(endpoint, handler)
  }

  async call<E extends BetterSidebarEndpoint>(
    endpoint: E,
    payload: BetterSidebarReqMap[E],
    opts?: { signal?: AbortSignal },
  ): Promise<SidebarResult<BetterSidebarResMap[E]>> {
    const handler = this.handlers.get(endpoint)
    if (handler === undefined) return { ok: true, value: null as never }
    return handler(payload as unknown as Record<string, unknown>, opts?.signal) as Promise<SidebarResult<BetterSidebarResMap[E]>>
  }
}

afterEach(() => cleanup())

describe('SkillsTab', () => {
  it('renders names, descriptions, and status chips for a mixed list', async () => {
    const rpc = new FakeRpc()
    rpc.setHandler(Endpoints.skillsList, () => Promise.resolve({
      ok: true,
      value: {
        skills: [
          entry({ name: 'alpha', description: 'Alpha thing' }),
          entry({ name: 'beta', invocation: { modelInvocable: false, userInvocable: false } }),
          entry({ name: 'gamma', invocation: { modelInvocable: true, userInvocable: false } }),
          entry({ name: 'delta', invocation: { modelInvocable: false, userInvocable: true } }),
        ],
      },
    }))
    render(<SkillsTab rpc={rpc} t={t} />)

    await screen.findByText('alpha')
    expect(screen.getByText('Alpha thing')).toBeTruthy()
    expect(screen.getByText('beta')).toBeTruthy()
    expect(screen.getByText('gamma')).toBeTruthy()
    expect(screen.getByText('delta')).toBeTruthy()
    // The localized status text is rendered verbatim (keys as the stub returns).
    expect(screen.getByText('statusEnabled')).toBeTruthy()
    expect(screen.getByText('statusDisabled')).toBeTruthy()
    expect(screen.getByText('statusModelOnly')).toBeTruthy()
    expect(screen.getByText('statusUserOnly')).toBeTruthy()
  })

  it('shows the empty state for an empty catalog', async () => {
    const rpc = new FakeRpc()
    rpc.setHandler(Endpoints.skillsList, () => Promise.resolve({ ok: true, value: { skills: [] } }))
    render(<SkillsTab rpc={rpc} t={t} />)

    await screen.findByText('emptyTitle')
    expect(screen.getByText('emptyHint')).toBeTruthy()
  })

  it('shows a load error with a retry, and retrying recovers into the list', async () => {
    const rpc = new FakeRpc()
    let failing = true
    rpc.setHandler(Endpoints.skillsList, () => {
      if (failing) return Promise.resolve({ ok: false, error: { code: 'internal', message: 'boom' } as SidebarError })
      return Promise.resolve({ ok: true, value: { skills: [entry({ name: 'alpha' })] } })
    })
    render(<SkillsTab rpc={rpc} t={t} />)

    await screen.findByText('errorTitle')
    expect(screen.getByRole('button', { name: 'errorRetry' })).toBeTruthy()

    failing = false
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'errorRetry' }))

    await waitFor(() => {
      expect(screen.queryByText('errorTitle')).toBeNull()
    })
    await screen.findByText('alpha')
  })

  it('skillStatus derives the four statuses from the invocation policy', () => {
    expect(skillStatus(entry({ name: 'a' }))).toBe('enabled')
    expect(skillStatus(entry({ name: 'b', invocation: { modelInvocable: false, userInvocable: false } }))).toBe('disabled')
    expect(skillStatus(entry({ name: 'c', invocation: { modelInvocable: true, userInvocable: false } }))).toBe('modelOnly')
    expect(skillStatus(entry({ name: 'd', invocation: { modelInvocable: false, userInvocable: true } }))).toBe('userOnly')
  })
})