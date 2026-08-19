export class SkillService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async list() {
        const registry = this.deps.getRegistry();
        if (!registry)
            return { skills: [] };
        const summaries = await registry.list();
        return { skills: summaries.map(toEntry) };
    }
}
function toEntry(s) {
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
    };
}
//# sourceMappingURL=skills.js.map