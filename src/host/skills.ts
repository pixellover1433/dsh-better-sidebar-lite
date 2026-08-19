import type { SkillRegistry, SkillSummary } from '@deepseek-ai/dsh-skill'
import type { ScopeKey } from '@deepseek-ai/dsh-scope'
import type { SkillEntry, SkillListRequest, SkillListResult } from '../contract/index.ts'

/** Lazy harness agent-presets seam; structurally typed to avoid extra runtime deps. */
interface AgentPresetsSeam {
  serviceFor(agent: unknown, name: string): unknown
  standingKeyFor(id?: string): Promise<unknown> | unknown
}

export interface SkillServiceDeps {
  /** Lazily resolved harness skill registry; undefined when the seam is not composed. */
  getSkills: () => SkillRegistry | undefined
  /** Lazy harness agent registry; typed structurally to avoid extra runtime deps. */
  getAgents: () => { get(id: string): unknown } | undefined
  /** Lazy harness session store; returns the session record or undefined. */
  getSession: (sessionId: string) => unknown
  /** Lazy harness agent-presets registry; structurally typed. */
  getAgentPresets: () => AgentPresetsSeam | undefined
}

export class SkillService {
  constructor(private readonly deps: SkillServiceDeps) {}

  /**
   * List the catalog the session's SKILLS tab should display.
   *
   * Mirrors the harness's presenterScopeFor: the view scope is the live agent
   * when one is present, else the session's agent-preset standing key. A fresh
   * (cold) session therefore still lists its preset's FULL configured catalog —
   * all skills, all four invocation statuses, no filtering — instead of the
   * host-global (which would otherwise show 0 skills until they are injected
   * into a live session).
   */
  // Listing never throws: any failure (including an absent seam) is surfaced as a
  // SUCCESS result carrying the diagnostic detail in `warning`, which survives
  // RPC value-slot JSON serialization as a plain string (a thrown raw Error
  // would be JSON-mangled to {}). The client renders the warning as a hint.
  async list(req: SkillListRequest): Promise<SkillListResult> {
    try {
      const live = req.sessionId === undefined ? undefined : this.deps.getAgents()?.get(req.sessionId)
      const presets = this.deps.getAgentPresets()
      // Scope-merge for the live agent: its preset may realm-mount its own skill
      // registry (invisible to host contexts), so address that first; else fall
      // back to the host registry.
      const scoped = live === undefined ? undefined : (presets?.serviceFor(live, 'skills') as unknown as SkillRegistry | undefined)
      const registry = scoped ?? this.deps.getSkills()
      if (!registry) return this.warn('skill registry is absent (neither the agent preset nor the host composes @deepseek-ai/dsh-skill)')
      // The view scope is the live agent (its layer chain merges global +
      // ancestors) or, for a cold session, its preset's standing key; cwd is
      // required — skill lookup is cwd-sensitive. list() returns the full
      // catalog (all four invocation statuses, no filtering).
      const scope = await this.resolveScope(req.sessionId, live, presets)
      const summaries = await registry.list({ cwd: req.cwd, ...(scope === undefined ? {} : { scope }) })
      return { skills: summaries.map(toEntry) }
    } catch (error: unknown) {
      return this.warn(error)
    }
  }

  /**
   * The preset a session actually runs, newest selection winning (mirrors the
   * harness's resolveSessionPreset, implemented structurally with no runtime
   * dependency). The header supplies the creation-time value; every later
   * selection is a logged event, so the last one is the answer.
   */
  private resolveSessionPreset(session: unknown): string | undefined {
    const events = (session as { events?: readonly { type?: string; data?: { agentPreset?: string } }[] } | undefined)?.events
    if (events !== undefined) {
      for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index]
        if (event?.type === 'agent-preset/selected') return event.data?.agentPreset
      }
    }
    return (session as { header?: { agentPreset?: string } } | undefined)?.header?.agentPreset
  }

  /**
   * Resolve the registry view scope, mirroring the harness's presenterScopeFor:
   * a live agent is the scope itself; otherwise the session preset's standing
   * key. Any failure (an absent preset, an unusable roster entry, a session
   * that cannot be read) degrades to `undefined` (host-global), never throws.
   */
  private async resolveScope(
    sessionId: string | undefined,
    live: unknown,
    presets: AgentPresetsSeam | undefined,
  ): Promise<ScopeKey | undefined> {
    if (live !== undefined) return live as ScopeKey
    if (presets === undefined) return undefined
    try {
      const session = sessionId === undefined ? undefined : this.deps.getSession(sessionId)
      const presetId = this.resolveSessionPreset(session)
      const key = await presets.standingKeyFor(presetId)
      return key as ScopeKey
    } catch {
      // Swallows only the unknown/unusable-preset rejection from the roster:
      // a deleted or broken preset must degrade this read, never fail it.
      return undefined
    }
  }

  /** Coerce a listing failure into a SUCCESS result whose `warning` is a plain string. */
  private warn(error: unknown): SkillListResult {
    const detail = error instanceof Error ? error.message : String(error)
    console.error(`better-sidebar: skills/list failed, returning warning: ${detail}`)
    return { skills: [], warning: `skills/list failed: ${detail}` }
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