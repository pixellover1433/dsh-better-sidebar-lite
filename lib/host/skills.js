export class SkillService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async list(req) {
        try {
            const live = req.sessionId === undefined ? undefined : this.deps.getAgents()?.get(req.sessionId);
            const presets = this.deps.getAgentPresets();
            // Scope-merge for the live agent: its preset may realm-mount its own skill
            // registry (invisible to host contexts), so address that first; else fall
            // back to the host registry.
            const scoped = live === undefined ? undefined : presets?.serviceFor(live, 'skills');
            const registry = scoped ?? this.deps.getSkills();
            if (!registry)
                return { skills: [] };
            // The view scope is the live agent (its layer chain merges global +
            // ancestors); cwd is required — skill lookup is cwd-sensitive. list()
            // returns the full catalog (all four invocation statuses, no filtering).
            const scope = live;
            const summaries = await registry.list({ cwd: req.cwd, ...(scope === undefined ? {} : { scope }) });
            return { skills: summaries.map(toEntry) };
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            console.error(`better-sidebar: skills/list threw (cwd=${req.cwd}, sessionId=${req.sessionId ?? 'none'}): ${detail}`);
            throw { code: 'internal', message: `skills/list failed: ${detail}` };
        }
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