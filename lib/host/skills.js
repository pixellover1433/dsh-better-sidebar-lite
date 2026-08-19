export class SkillService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    // Listing never throws: any failure (including an absent seam) is surfaced as a
    // SUCCESS result carrying the diagnostic detail in `warning`, which survives
    // RPC value-slot JSON serialization as a plain string (a thrown raw Error
    // would be JSON-mangled to {}). The client renders the warning as a hint.
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
                return this.warn('skill registry is absent (neither the agent preset nor the host composes @deepseek-ai/dsh-skill)');
            // The view scope is the live agent (its layer chain merges global +
            // ancestors); cwd is required — skill lookup is cwd-sensitive. list()
            // returns the full catalog (all four invocation statuses, no filtering).
            const scope = live;
            const summaries = await registry.list({ cwd: req.cwd, ...(scope === undefined ? {} : { scope }) });
            return { skills: summaries.map(toEntry) };
        }
        catch (error) {
            return this.warn(error);
        }
    }
    /** Coerce a listing failure into a SUCCESS result whose `warning` is a plain string. */
    warn(error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`better-sidebar: skills/list failed, returning warning: ${detail}`);
        return { skills: [], warning: `skills/list failed: ${detail}` };
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