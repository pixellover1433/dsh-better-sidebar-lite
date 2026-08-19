import type { SkillRegistry } from '@deepseek-ai/dsh-skill';
import type { SkillListResult } from '../contract/index.ts';
export interface SkillServiceDeps {
    /** Lazily resolved harness skill registry; undefined when the seam is not composed. */
    getRegistry: () => SkillRegistry | undefined;
}
export declare class SkillService {
    private readonly deps;
    constructor(deps: SkillServiceDeps);
    list(): Promise<SkillListResult>;
}
//# sourceMappingURL=skills.d.ts.map