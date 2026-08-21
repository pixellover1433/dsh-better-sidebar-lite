import type { SkillRegistry } from '@deepseek-ai/dsh-skill';
import type { Dirent } from 'node:fs';
import type { SkillDetailRequest, SkillDetailResult, SkillListRequest, SkillListResult } from '../contract/index.ts';
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
    /** List a directory's entries (used to discover the files a skill can reference). */
    readDir?: (dir: string) => Promise<Dirent[]>;
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
     * Load one skill's detail, mirroring list()'s error philosophy (never throws;
     * every failure — including an absent seam or an unresolvable skill — is a
     * SUCCESS result whose `found`/`warning` fields carry the outcome, so the
     * RPC value slot stays JSON-safe). Found details map the loaded SKILL.md body
     * and the sibling files the skill's resource directory can reference.
     */
    detail(req: SkillDetailRequest): Promise<SkillDetailResult>;
    /** Resolve the registry to address and the view scope, shared by list() and detail(). */
    private resolveRegistry;
    /**
     * Coerce a detail-load failure into a SUCCESS result whose `found` is false
     * and whose `warning` is a plain string. Mirrors list()'s warn() — never throws.
     */
    private warnDetail;
    /** Stable empty field defaults shared by every could-not-load detail outcome. */
    private emptyDetail;
    /**
     * List the files a skill's resource directory recursively exposes. The
     * resource directory is the skill's own directory: the provider-declared
     * directory base when present, else the directory of the SKILL.md file.
     * Directories are descended into (never emitted); only files are surfaced as
     * references, named by their path relative to the resource directory with
     * `/` separators. A missing seam, an unreadable/unknown root, or an
     * unreadable subdirectory all degrade to (part of) an empty reference list —
     * never a failure.
     */
    private resolveReferences;
    /**
     * Depth-first, files-only walk of the resource directory. Descends into
     * subdirectories (symlinks never qualify as `isDirectory()`, so no cycle
     * risk), surfaces only files, and stops once the reference cap or depth bound
     * is hit. An unreadable subdirectory contributes nothing and is skipped.
     */
    private collectReferences;
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