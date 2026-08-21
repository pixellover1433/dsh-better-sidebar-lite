import { dirname, join } from 'node:path';
/** Cap on the total referenced files surfaced for a skill (bounds recursion). */
const MAX_REFERENCE_FILES = 500;
/** Max sub-directory depth the reference traversal descends into (bounds recursion). */
const MAX_REFERENCE_DEPTH = 16;
export class SkillService {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
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
    // Listing never throws: any failure (including an absent seam) is surfaced as a
    // SUCCESS result carrying the diagnostic detail in `warning`, which survives
    // RPC value-slot JSON serialization as a plain string (a thrown raw Error
    // would be JSON-mangled to {}). The client renders the warning as a hint.
    async list(req) {
        try {
            const { registry, scope } = await this.resolveRegistry(req);
            if (!registry)
                return this.warn('skill registry is absent (neither the agent preset nor the host composes @deepseek-ai/dsh-skill)');
            // The view scope is the live agent (its layer chain merges global +
            // ancestors) or, for a cold session, its preset's standing key; cwd is
            // required — skill lookup is cwd-sensitive. list() returns the full
            // catalog (all four invocation statuses, no filtering).
            const summaries = await registry.list({ cwd: req.cwd, ...(scope === undefined ? {} : { scope }) });
            return { skills: summaries.map(toEntry) };
        }
        catch (error) {
            return this.warn(error);
        }
    }
    /**
     * Load one skill's detail, mirroring list()'s error philosophy (never throws;
     * every failure — including an absent seam or an unresolvable skill — is a
     * SUCCESS result whose `found`/`warning` fields carry the outcome, so the
     * RPC value slot stays JSON-safe). Found details map the loaded SKILL.md body
     * and the sibling files the skill's resource directory can reference.
     */
    async detail(req) {
        try {
            const { registry, scope } = await this.resolveRegistry(req);
            if (!registry)
                return this.warnDetail(req.name, 'skill registry is absent (neither the agent preset nor the host composes @deepseek-ai/dsh-skill)');
            const definition = await registry.get(req.name, { cwd: req.cwd, ...(scope === undefined ? {} : { scope }) });
            if (definition === undefined) {
                // A could-not-load outcome: stable empty field values keep the wire shape consistent.
                return { ...this.emptyDetail(req.name), warning: `skill "${req.name}" not found` };
            }
            const references = await this.resolveReferences(definition);
            const resourceDir = skillResourceDir(definition);
            return {
                found: true,
                name: definition.name,
                description: definition.description,
                ...(definition.whenToUse !== undefined ? { whenToUse: definition.whenToUse } : {}),
                invocation: {
                    modelInvocable: definition.invocation.modelInvocable,
                    userInvocable: definition.invocation.userInvocable,
                },
                source: definition.source,
                provider: definition.provider,
                content: definition.content,
                ...(definition.path !== undefined ? { path: definition.path } : {}),
                ...(resourceDir !== undefined ? { resourceDir } : {}),
                references,
            };
        }
        catch (error) {
            return this.warnDetail(req.name, error);
        }
    }
    /** Resolve the registry to address and the view scope, shared by list() and detail(). */
    async resolveRegistry(req) {
        const live = req.sessionId === undefined ? undefined : this.deps.getAgents()?.get(req.sessionId);
        const presets = this.deps.getAgentPresets();
        // Scope-merge for the live agent: its preset may realm-mount its own skill
        // registry (invisible to host contexts), so address that first; else fall
        // back to the host registry.
        const scoped = live === undefined ? undefined : presets?.serviceFor(live, 'skills');
        return { registry: scoped ?? this.deps.getSkills(), scope: await this.resolveScope(req.sessionId, live, presets) };
    }
    /**
     * Coerce a detail-load failure into a SUCCESS result whose `found` is false
     * and whose `warning` is a plain string. Mirrors list()'s warn() — never throws.
     */
    warnDetail(name, error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`better-sidebar: skills/detail failed, returning warning: ${detail}`);
        return { ...this.emptyDetail(name), warning: `skills/detail failed: ${detail}` };
    }
    /** Stable empty field defaults shared by every could-not-load detail outcome. */
    emptyDetail(name) {
        return {
            found: false,
            name,
            description: '',
            invocation: { modelInvocable: false, userInvocable: false },
            source: '',
            provider: '',
            content: '',
            references: [],
        };
    }
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
    async resolveReferences(definition) {
        const readDir = this.deps.readDir;
        if (readDir === undefined)
            return [];
        const resourceDir = skillResourceDir(definition);
        if (resourceDir === undefined)
            return [];
        const refs = [];
        await this.collectReferences(resourceDir, [], refs, 0, readDir);
        refs.sort((a, b) => a.name.localeCompare(b.name));
        return refs.slice(0, MAX_REFERENCE_FILES);
    }
    /**
     * Depth-first, files-only walk of the resource directory. Descends into
     * subdirectories (symlinks never qualify as `isDirectory()`, so no cycle
     * risk), surfaces only files, and stops once the reference cap or depth bound
     * is hit. An unreadable subdirectory contributes nothing and is skipped.
     */
    async collectReferences(dir, segments, out, depth, readDir) {
        if (depth > MAX_REFERENCE_DEPTH || out.length >= MAX_REFERENCE_FILES)
            return;
        let entries;
        try {
            entries = await readDir(dir);
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (out.length >= MAX_REFERENCE_FILES)
                return;
            // Only the skill's own root SKILL.md is excluded; a SKILL.md in a
            // subdirectory is a legitimate referenced file.
            if (depth === 0 && entry.isFile() && entry.name.toLowerCase() === 'skill.md')
                continue;
            const next = [...segments, entry.name];
            if (entry.isDirectory()) {
                await this.collectReferences(join(dir, entry.name), next, out, depth + 1, readDir);
            }
            else {
                out.push({ name: next.join('/'), path: join(dir, entry.name), kind: 'file' });
            }
        }
    }
    /**
     * The preset a session actually runs, newest selection winning (mirrors the
     * harness's resolveSessionPreset, implemented structurally with no runtime
     * dependency). The header supplies the creation-time value; every later
     * selection is a logged event, so the last one is the answer.
     */
    resolveSessionPreset(session) {
        const events = session?.events;
        if (events !== undefined) {
            for (let index = events.length - 1; index >= 0; index -= 1) {
                const event = events[index];
                if (event?.type === 'agent-preset/selected')
                    return event.data?.agentPreset;
            }
        }
        return session?.header?.agentPreset;
    }
    /**
     * Resolve the registry view scope, mirroring the harness's presenterScopeFor:
     * a live agent is the scope itself; otherwise the session preset's standing
     * key. Any failure (an absent preset, an unusable roster entry, a session
     * that cannot be read) degrades to `undefined` (host-global), never throws.
     */
    async resolveScope(sessionId, live, presets) {
        if (live !== undefined)
            return live;
        if (presets === undefined)
            return undefined;
        try {
            const session = sessionId === undefined ? undefined : this.deps.getSession(sessionId);
            const presetId = this.resolveSessionPreset(session);
            const key = await presets.standingKeyFor(presetId);
            return key;
        }
        catch {
            // Swallows only the unknown/unusable-preset rejection from the roster:
            // a deleted or broken preset must degrade this read, never fail it.
            return undefined;
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
/** The absolute resource directory a skill can reference: its declared
 *  directory base when present, else the directory of the SKILL.md file. */
function skillResourceDir(definition) {
    if (definition.resourceBase?.kind === 'directory')
        return definition.resourceBase.path;
    return definition.path === undefined ? undefined : dirname(definition.path);
}
//# sourceMappingURL=skills.js.map