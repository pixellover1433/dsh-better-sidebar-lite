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
    /** Human-readable failure detail when the catalog could not be listed; survives the RPC value slot (strings are JSON-safe). */
    warning?: string;
}
/** One sibling entry inside a skill's resource directory. */
export interface SkillReference {
    name: string;
    path: string;
    kind: 'file' | 'directory';
}
export interface SkillDetailRequest {
    /** Kebab-case skill name to load. */
    name: string;
    /** Absolute workspace root; skill lookup is cwd-sensitive. */
    cwd: string;
    /** Active session id; when present the host merges its per-agent scope chain. */
    sessionId?: string;
}
export interface SkillDetailResult {
    /** Whether the skill resolved (a definitive load) vs. a could-not-load outcome. */
    found: boolean;
    name: string;
    description: string;
    whenToUse?: string;
    invocation: SkillInvocation;
    source: string;
    provider: string;
    /** The skill's SKILL.md markdown body (after frontmatter removal). */
    content: string;
    /** Absolute SKILL.md file path when known. */
    path?: string;
    /** Absolute resource directory the skill can reference, when known. */
    resourceDir?: string;
    /** Sibling files/dirs in the resource directory the skill can reference. */
    references: SkillReference[];
    /** Human-readable failure detail; present exactly when found === false. */
    warning?: string;
}
//# sourceMappingURL=skills.d.ts.map