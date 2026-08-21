import type { SkillDefinition, SkillRegistry, SkillSummary } from '@deepseek-ai/dsh-skill'
import type { ScopeKey } from '@deepseek-ai/dsh-scope'
import type { Dirent } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  SkillDetailRequest,
  SkillDetailResult,
  SkillEntry,
  SkillListRequest,
  SkillListResult,
  SkillReference,
} from '../contract/index.ts'

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
  /** List a directory's entries (used to discover the files a skill can reference). */
  readDir?: (dir: string) => Promise<Dirent[]>
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
      const { registry, scope } = await this.resolveRegistry(req)
      if (!registry) return this.warn('skill registry is absent (neither the agent preset nor the host composes @deepseek-ai/dsh-skill)')
      // The view scope is the live agent (its layer chain merges global +
      // ancestors) or, for a cold session, its preset's standing key; cwd is
      // required — skill lookup is cwd-sensitive. list() returns the full
      // catalog (all four invocation statuses, no filtering).
      const summaries = await registry.list({ cwd: req.cwd, ...(scope === undefined ? {} : { scope }) })
      return { skills: summaries.map(toEntry) }
    } catch (error: unknown) {
      return this.warn(error)
    }
  }

  /**
   * Load one skill's detail, mirroring list()'s error philosophy (never throws;
   * every failure — including an absent seam or an unresolvable skill — is a
   * SUCCESS result whose `found`/`warning` fields carry the outcome, so the
   * RPC value slot stays JSON-safe). Found details map the loaded SKILL.md body
   * and the sibling files the skill's resource directory can reference.
   */
  async detail(req: SkillDetailRequest): Promise<SkillDetailResult> {
    try {
      const { registry, scope } = await this.resolveRegistry(req)
      if (!registry) return this.warnDetail(req.name, 'skill registry is absent (neither the agent preset nor the host composes @deepseek-ai/dsh-skill)')
      const definition = await registry.get(req.name, { cwd: req.cwd, ...(scope === undefined ? {} : { scope }) })
      if (definition === undefined) {
        // A could-not-load outcome: stable empty field values keep the wire shape consistent.
        return { ...this.emptyDetail(req.name), warning: `skill "${req.name}" not found` }
      }
      const references = await this.resolveReferences(definition)
      const resourceDir = skillResourceDir(definition)
      return {
        found: true,
        name: definition.name,
        description: definition.description,
        ...(definition.whenToUse !== undefined ? { whenToUse: definition.whenToUse } : {}),
        invocation: {
          modelInvocable: definition.invocation.modelInvocable,
          userInvocable: definition.invocation.userInvocable,
        },
        source: definition.source,
        provider: definition.provider,
        content: definition.content,
        ...(definition.path !== undefined ? { path: definition.path } : {}),
        ...(resourceDir !== undefined ? { resourceDir } : {}),
        references,
      }
    } catch (error: unknown) {
      return this.warnDetail(req.name, error)
    }
  }

  /** Resolve the registry to address and the view scope, shared by list() and detail(). */
  private async resolveRegistry(req: { cwd: string; sessionId?: string }): Promise<{ registry: SkillRegistry | undefined; scope: ScopeKey | undefined }> {
    const live = req.sessionId === undefined ? undefined : this.deps.getAgents()?.get(req.sessionId)
    const presets = this.deps.getAgentPresets()
    // Scope-merge for the live agent: its preset may realm-mount its own skill
    // registry (invisible to host contexts), so address that first; else fall
    // back to the host registry.
    const scoped = live === undefined ? undefined : (presets?.serviceFor(live, 'skills') as unknown as SkillRegistry | undefined)
    return { registry: scoped ?? this.deps.getSkills(), scope: await this.resolveScope(req.sessionId, live, presets) }
  }

  /**
   * Coerce a detail-load failure into a SUCCESS result whose `found` is false
   * and whose `warning` is a plain string. Mirrors list()'s warn() — never throws.
   */
  private warnDetail(name: string, error: unknown): SkillDetailResult {
    const detail = error instanceof Error ? error.message : String(error)
    console.error(`better-sidebar: skills/detail failed, returning warning: ${detail}`)
    return { ...this.emptyDetail(name), warning: `skills/detail failed: ${detail}` }
  }

  /** Stable empty field defaults shared by every could-not-load detail outcome. */
  private emptyDetail(name: string): SkillDetailResult {
    return {
      found: false,
      name,
      description: '',
      invocation: { modelInvocable: false, userInvocable: false },
      source: '',
      provider: '',
      content: '',
      references: [],
    }
  }

  /**
   * List the sibling files/dirs a skill's resource directory exposes. The
   * resource directory is the skill's own directory: the provider-declared
   * directory base when present, else the directory of the SKILL.md file. A
   * missing seam, an unreadable directory, or an unknown directory all resolve
   * to an empty reference list — never a failure.
   */
  private async resolveReferences(definition: SkillDefinition): Promise<SkillReference[]> {
    if (this.deps.readDir === undefined) return []
    const resourceDir = skillResourceDir(definition)
    if (resourceDir === undefined) return []
    let entries: Dirent[]
    try {
      entries = await this.deps.readDir(resourceDir)
    } catch {
      return []
    }
    const refs: SkillReference[] = []
    for (const entry of entries) {
      // Exclude the skill's own SKILL.md from references.
      if (entry.isFile() && entry.name.toLowerCase() === 'skill.md') continue
      refs.push({ name: entry.name, path: join(resourceDir, entry.name), kind: entry.isDirectory() ? 'directory' : 'file' })
    }
    refs.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1))
    return refs.slice(0, 500)
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

/** The absolute resource directory a skill can reference: its declared
 *  directory base when present, else the directory of the SKILL.md file. */
function skillResourceDir(definition: SkillDefinition): string | undefined {
  if (definition.resourceBase?.kind === 'directory') return definition.resourceBase.path
  return definition.path === undefined ? undefined : dirname(definition.path)
}