import type { SkillRegistry, SkillSummary } from '@deepseek-ai/dsh-skill'
import type { SkillEntry, SkillListResult } from '../contract/index.ts'

export interface SkillServiceDeps {
  /** Lazily resolved harness skill registry; undefined when the seam is not composed. */
  getRegistry: () => SkillRegistry | undefined
}

export class SkillService {
  constructor(private readonly deps: SkillServiceDeps) {}

  async list(): Promise<SkillListResult> {
    const registry = this.deps.getRegistry()
    if (!registry) return { skills: [] }
    const summaries = await registry.list()
    return { skills: summaries.map(toEntry) }
  }
}

function toEntry(s: SkillSummary): SkillEntry {
  return {
    name: s.name,
    description: s.description,
    ...(s.whenToUse !== undefined ? { whenToUse: s.whenToUse } : {}),
    invocation: {
      modelInvocable: s.invocation.modelInvocable,
      userInvocable: s.invocation.userInvocable,
    },
    source: s.source,
    provider: s.provider,
  }
}