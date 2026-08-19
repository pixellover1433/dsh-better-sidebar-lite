import type { SkillRegistry } from '@deepseek-ai/dsh-skill';
import type { SkillListRequest, SkillListResult } from '../contract/index.ts';
/** Lazy harness agent-presets seam; structurally typed to avoid extra runtime deps. */
interface AgentPresetsSeam {
    serviceFor(agent: unknown, name: string): unknown;
    standingKeyFor(id?: string): Promise<unknown> | unknown;
}
export interface SkillServiceDeps {
    /** Lazily resolved harness skill registry; undefined when the seam is not composed. */
    getSkills: () => SkillRegistry | undefined;
    /** Lazy harness agent registry; typed structurally to avoid extra runtime deps. */
    getAgents: () => {
        get(id: string): unknown;
    } | undefined;
    /** Lazy harness session store; returns the session record or undefined. */
    getSession: (sessionId: string) => unknown;
    /** Lazy harness agent-presets registry; structurally typed. */
    getAgentPresets: () => AgentPresetsSeam | undefined;
}
export declare class SkillService {
    private readonly deps;
    constructor(deps: SkillServiceDeps);
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
    list(req: SkillListRequest): Promise<SkillListResult>;
    /**
     * The preset a session actually runs, newest selection winning (mirrors the
     * harness's resolveSessionPreset, implemented structurally with no runtime
     * dependency). The header supplies the creation-time value; every later
     * selection is a logged event, so the last one is the answer.
     */
    private resolveSessionPreset;
    /**
     * Resolve the registry view scope, mirroring the harness's presenterScopeFor:
     * a live agent is the scope itself; otherwise the session preset's standing
     * key. Any failure (an absent preset, an unusable roster entry, a session
     * that cannot be read) degrades to `undefined` (host-global), never throws.
     */
    private resolveScope;
    /** Coerce a listing failure into a SUCCESS result whose `warning` is a plain string. */
    private warn;
}
export {};
//# sourceMappingURL=skills.d.ts.map