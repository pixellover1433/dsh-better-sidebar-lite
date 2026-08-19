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
    // Mirror the harness api-proxy: the live agent's preset may realm-mount its
    // own skill registry, which host contexts cannot see; address the agent's
    // registry, else fall back to the host-level registry.
    const scoped = live === undefined ? undefined : (presets?.serviceFor(live, 'skills') as SkillRegistry | undefined)
    const registry = scoped ?? this.deps.getSkills()
    if (!registry) return { skills: [] }
    // Merge the reachable catalog across the scope chain (global + the live
    // agent's layers) and do NOT narrow by a workspace cwd, so the full
    // configured catalog is shown regardless of which workspace is open.
    const summaries = await registry.list(live === undefined ? {} : { scope: live as unknown as ScopeKey })
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