/**
 * Skills models shared by host (producer) and client (consumer).
 * Pure types; no Node/DOM/React imports.
 */
/** Invocation policy: controls whether a skill is invocable for the model / user. */
export interface SkillInvocation {
    modelInvocable: boolean;
    userInvocable: boolean;
}
/** One skill's invocation-neutral summary, mapped onto the plugin-owned wire shape. */
export interface SkillEntry {
    name: string;
    description: string;
    whenToUse?: string;
    invocation: SkillInvocation;
    source: string;
    provider: string;
}
/** The skills catalog merges the reachable harness scopes.
 *  An optional session id scopes the merge to that agent's layer chain. */
export interface SkillListRequest {
    /** Absolute workspace root: skill lookup is cwd-sensitive (selects project/user roots). */
    cwd: string;
    /** Active session id; when present the host merges its per-agent scope chain. */
    sessionId?: string;
}
export interface SkillListResult {
    skills: SkillEntry[];
}
//# sourceMappingURL=skills.d.ts.map