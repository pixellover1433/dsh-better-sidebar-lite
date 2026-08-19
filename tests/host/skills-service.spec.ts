import { describe, expect, it } from 'vitest'
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

describe('SkillService', () => {
  it('maps list() summaries onto plugin-owned wire entries', async () => {
    const registry = registryWith([
      summary({ name: 'alpha', description: 'A thing', provider: 'fs' }),
      summary({ name: 'beta', invocation: { modelInvocable: false, userInvocable: true }, whenToUse: 'when X', source: 'user-dsh', provider: 'runtime' }),
    ])
    const service = new SkillService({ getRegistry: () => registry })
    const res = await service.list()
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
    const service = new SkillService({ getRegistry: () => registryWith([summary({ name: 'alpha' })]) })
    const res = await service.list()
    expect(res.skills).toHaveLength(1)
    // exactOptionalPropertyTypes: an absent whenToUse must not ride undefined.
    expect(Object.hasOwn(res.skills[0] as object, 'whenToUse')).toBe(false)
  })

  it('includes whenToUse when present', async () => {
    const service = new SkillService({ getRegistry: () => registryWith([summary({ name: 'alpha', whenToUse: 'use when' })]) })
    const res = await service.list()
    expect(res.skills[0]?.whenToUse).toBe('use when')
  })

  it('returns an empty catalog when the registry seam is absent', async () => {
    const service = new SkillService({ getRegistry: () => undefined })
    await expect(service.list()).resolves.toEqual({ skills: [] })
  })
})