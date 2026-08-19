/**
 * Skills models shared by host (producer) and client (consumer).
 * Pure types; no Node/DOM/React imports.
 */

/** Invocation policy: controls whether a skill is invocable for the model / user. */
export interface SkillInvocation {
  modelInvocable: boolean
  userInvocable: boolean
}

/** One skill's invocation-neutral summary, mapped onto the plugin-owned wire shape. */
export interface SkillEntry {
  name: string
  description: string
  whenToUse?: string
  invocation: SkillInvocation
  source: string
  provider: string
}

export interface SkillListRequest {
  /** Absolute workspace root (active session cwd or current workspace) to scope discovery. */
  cwd: string
  /** Active session id; when present the host resolves the per-agent skill registry. */
  sessionId?: string
}

export interface SkillListResult {
  skills: SkillEntry[]
}