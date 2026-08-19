import { describe, expect, it, vi } from 'vitest'
import type { SkillRegistry, SkillSummary } from '@deepseek-ai/dsh-skill'
import { SkillService } from '../../src/host/skills.ts'

/** Build a fake summary; required fields are filled from defaults. */
function summary(overrides: Partial<SkillSummary> & { name: string }): SkillSummary {
  return { description: 'desc', invocation: { modelInvocable: true, userInvocable: true }, source: 'bundled', provider: 'p', ...overrides } as SkillSummary
}

/** A registry whose list() yields the given summaries. */
function registryWith(summaries: SkillSummary[]): SkillRegistry {
  return { list: async () => summaries } as unknown as SkillRegistry
}

/** Structural harness agent-registry fake. */
function agentsWith(agent: unknown): { get(id: string): unknown } {
  return { get: () => agent }
}

/** Structural harness agent-presets fake. */
function presetsWith(registry: unknown): { serviceFor: (a: unknown, n: string) => unknown } {
  return { serviceFor: () => registry }
}

/** Deps that only compose the host-level skill registry (no agents/presets). */
function hostOnly(registry: SkillRegistry | undefined): ConstructorParameters<typeof SkillService>[0] {
  return { getSkills: () => registry, getAgents: () => undefined, getAgentPresets: () => undefined }
}

describe('SkillService', () => {
  it('maps list() summaries onto plugin-owned wire entries', async () => {
    const registry = registryWith([
      summary({ name: 'alpha', description: 'A thing', provider: 'fs' }),
      summary({ name: 'beta', invocation: { modelInvocable: false, userInvocable: true }, whenToUse: 'when X', source: 'user-dsh', provider: 'runtime' }),
    ])
    const service = new SkillService(hostOnly(registry))
    const res = await service.list({})
    expect(res.skills).toHaveLength(2)

    const alpha = res.skills[0]!
    expect(alpha).toEqual({
      name: 'alpha',
      description: 'A thing',
      invocation: { modelInvocable: true, userInvocable: true },
      source: 'bundled',
      provider: 'fs',
    })

    const beta = res.skills[1]!
    expect(beta).toMatchObject({
      name: 'beta',
      whenToUse: 'when X',
      invocation: { modelInvocable: false, userInvocable: true },
      source: 'user-dsh',
      provider: 'runtime',
    })
    expect(beta.whenToUse).toBe('when X')
  })

  it('omits whenToUse from the entry when absent', async () => {
    const service = new SkillService(hostOnly(registryWith([summary({ name: 'alpha' })])))
    const res = await service.list({})
    expect(res.skills).toHaveLength(1)
    // exactOptionalPropertyTypes: an absent whenToUse must not ride undefined.
    expect(Object.hasOwn(res.skills[0] as object, 'whenToUse')).toBe(false)
  })

  it('includes whenToUse when present', async () => {
    const service = new SkillService(hostOnly(registryWith([summary({ name: 'alpha', whenToUse: 'use when' })])))
    const res = await service.list({})
    expect(res.skills[0]?.whenToUse).toBe('use when')
  })

  it('returns an empty catalog when the registry seam is absent', async () => {
    const service = new SkillService(hostOnly(undefined))
    await expect(service.list({})).resolves.toEqual({ skills: [] })
  })

  it('addresses the per-agent scoped registry when a sessionId is present', async () => {
    const agent = { id: 's1' }
    const scopedList = vi.fn(async () => [summary({ name: 'scoped' })])
    const scopedRegistry = { list: scopedList } as unknown as SkillRegistry
    const service = new SkillService({
      getSkills: () => registryWith([]),
      getAgents: () => agentsWith(agent),
      getAgentPresets: () => presetsWith(scopedRegistry),
    })
    const res = await service.list({ sessionId: 's1' })
    // The scoped registry (not the host one) is addressed, with the live agent
    // as the view scope and no workspace narrowing.
    expect(scopedList).toHaveBeenCalledWith({ scope: agent })
    expect(res.skills).toHaveLength(1)
    expect(res.skills[0]?.name).toBe('scoped')
  })

  it('falls back to the host registry when a sessionId matches no live agent', async () => {
    const hostList = vi.fn(async () => [summary({ name: 'host' })])
    const service = new SkillService({
      getSkills: () => ({ list: hostList }) as unknown as SkillRegistry,
      getAgents: () => agentsWith(undefined),
      getAgentPresets: () => presetsWith(undefined),
    })
    const res = await service.list({ sessionId: 'missing' })
    // No live agent -> no scoped registry -> the host registry is addressed
    // with no scope (the global catalog).
    expect(hostList).toHaveBeenCalledWith({})
    expect(res.skills[0]?.name).toBe('host')
  })
})