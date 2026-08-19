import type { SkillRegistry } from '@deepseek-ai/dsh-skill';
import type { SkillListRequest, SkillListResult } from '../contract/index.ts';
export interface SkillServiceDeps {
    /** Lazily resolved harness skill registry; undefined when the seam is not composed. */
    getSkills: () => SkillRegistry | undefined;
    /** Lazy harness agent registry; typed structurally to avoid extra runtime deps. */
    getAgents: () => {
        get(id: string): unknown;
    } | undefined;
    /** Lazy harness agent-presets registry; structurally typed. */
    getAgentPresets: () => {
        serviceFor(agent: unknown, name: string): unknown;
    } | undefined;
}
export declare class SkillService {
    private readonly deps;
    constructor(deps: SkillServiceDeps);
    list(req: SkillListRequest): Promise<SkillListResult>;
    /** Coerce a listing failure into a SUCCESS result whose `warning` is a plain string. */
    private warn;
}
//# sourceMappingURL=skills.d.ts.map