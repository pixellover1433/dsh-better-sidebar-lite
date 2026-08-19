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

/** The skills catalog is the global root layer; no payload is needed. */
export type SkillListRequest = Record<string, never>

export interface SkillListResult {
  skills: SkillEntry[]
}