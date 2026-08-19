import type { SkillRegistry, SkillSummary } from '@deepseek-ai/dsh-skill'
import type { ScopeKey } from '@deepseek-ai/dsh-scope'
import type { SkillEntry, SkillListRequest, SkillListResult } from '../contract/index.ts'

export interface SkillServiceDeps {
  /** Lazily resolved harness skill registry; undefined when the seam is not composed. */
  getSkills: () => SkillRegistry | undefined
  /** Lazy harness agent registry; typed structurally to avoid extra runtime deps. */
  getAgents: () => { get(id: string): unknown } | undefined
  /** Lazy harness agent-presets registry; structurally typed. */
  getAgentPresets: () => { serviceFor(agent: unknown, name: string): unknown } | undefined
}

export class SkillService {
  constructor(private readonly deps: SkillServiceDeps) {}

  async list(req: SkillListRequest): Promise<SkillListResult> {
    const live = req.sessionId === undefined ? undefined : this.deps.getAgents()?.get(req.sessionId)
    const presets = this.deps.getAgentPresets()
    // Mirror harness api-proxy: the agent's preset may realm-mount its own skill
    // registry (invisible to host contexts); address it, else the host registry.
    const scoped = live === undefined ? undefined : (presets?.serviceFor(live, 'skills') as unknown as SkillRegistry | undefined)
    const registry = scoped ?? this.deps.getSkills()
    if (!registry) return { skills: [] }
    try {
      // The view scope is the live agent (its layer chain merges global +
      // ancestors); cwd is required — skill lookup is cwd-sensitive. list()
      // already returns all four invocation statuses, so no filtering here.
      const scope = live as unknown as ScopeKey | undefined
      const summaries = await registry.list({ cwd: req.cwd, ...(scope === undefined ? {} : { scope }) })
      return { skills: summaries.map(toEntry) }
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error)
      console.error(`better-sidebar: skills/list failed (cwd=${req.cwd}, sessionId=${req.sessionId ?? 'none'}): ${detail}`)
      throw error
    }
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