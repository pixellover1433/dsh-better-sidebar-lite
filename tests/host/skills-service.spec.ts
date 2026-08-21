import { describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import type { Dirent } from 'node:fs'
import type { SkillDefinition, SkillRegistry, SkillSummary } from '@deepseek-ai/dsh-skill'
import { SkillService } from '../../src/host/skills.ts'

/** Build a fake summary; required fields are filled from defaults. */
function summary(overrides: Partial<SkillSummary> & { name: string }): SkillSummary {
  return { description: 'desc', invocation: { modelInvocable: true, userInvocable: true }, source: 'bundled', provider: 'p', ...overrides } as SkillSummary
}

/** A registry whose list() yields the given summaries. */
function registryWith(summaries: SkillSummary[]): SkillRegistry {
  return { list: async () => summaries } as unknown as SkillRegistry
}

/** A registry whose get() performs no discovery and returns the given definition. */
function registryThatGets(definition: SkillDefinition | undefined): SkillRegistry {
  return { list: async () => [], get: async () => definition } as unknown as SkillRegistry
}

/** One readdir entry from a directory listing (structural Dirent fake). */
function dirEntry(name: string, isDir: boolean): { name: string; isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean } {
  return { name, isDirectory: () => isDir, isFile: () => !isDir, isSymbolicLink: () => false }
}

/** A SkillDefinition with a RESOURCE BASE (a file-backed provider). */
function definitionWithBase(): SkillDefinition {
  return {
    name: 'alpha',
    description: 'Alpha thing',
    whenToUse: 'use when X',
    invocation: { modelInvocable: true, userInvocable: false },
    source: 'user-dsh',
    provider: 'runtime',
    content: '# Alpha\nBody',
    path: '/repo/.dsh/skills/alpha/SKILL.md',
    resourceBase: { kind: 'directory', path: '/repo/.dsh/skills/alpha' },
  }
}

/** Structural harness agent-registry fake. */
function agentsWith(agent: unknown): { get(id: string): unknown } {
  return { get: () => agent }
}

/** Structural harness agent-presets fake; standingKeyFor defaults to a no-op. */
function presetsWith(
  registry: unknown,
  standingKeyFor?: (id?: string) => Promise<unknown> | unknown,
): { serviceFor: (a: unknown, n: string) => unknown; standingKeyFor: (id?: string) => Promise<unknown> | unknown } {
  return { serviceFor: () => registry, standingKeyFor: standingKeyFor ?? (async () => undefined) }
}

/** A cold session whose header names 'my-preset' and whose log has no selection. */
function sessionStub(): { header: { agentPreset: string }; events: [] } {
  return { header: { agentPreset: 'my-preset' }, events: [] }
}

/** Deps that only compose the host-level skill registry (no agents/presets). */
function hostOnly(registry: SkillRegistry | undefined): ConstructorParameters<typeof SkillService>[0] {
  return { getSkills: () => registry, getAgents: () => undefined, getSession: () => undefined, getAgentPresets: () => undefined }
}

describe('SkillService', () => {
  it('maps list() summaries onto plugin-owned wire entries', async () => {
    const registry = registryWith([
      summary({ name: 'alpha', description: 'A thing', provider: 'fs' }),
      summary({ name: 'beta', invocation: { modelInvocable: false, userInvocable: true }, whenToUse: 'when X', source: 'user-dsh', provider: 'runtime' }),
    ])
    const service = new SkillService(hostOnly(registry))
    const res = await service.list({ cwd: '/repo' })
    expect(res.skills).toHaveLength(2)

    const alpha = res.skills[0]!
    expect(alpha).toEqual({
      name: 'alpha',
      description: 'A thing',
      invocation: { modelInvocable: true, userInvocable: true },
      source: 'bundled',
      provider: 'fs',
    })

    const beta = res.skills[1]!
    expect(beta).toMatchObject({
      name: 'beta',
      whenToUse: 'when X',
      invocation: { modelInvocable: false, userInvocable: true },
      source: 'user-dsh',
      provider: 'runtime',
    })
    expect(beta.whenToUse).toBe('when X')
  })

  it('omits whenToUse from the entry when absent', async () => {
    const service = new SkillService(hostOnly(registryWith([summary({ name: 'alpha' })])))
    const res = await service.list({ cwd: '/repo' })
    expect(res.skills).toHaveLength(1)
    // exactOptionalPropertyTypes: an absent whenToUse must not ride undefined.
    expect(Object.hasOwn(res.skills[0] as object, 'whenToUse')).toBe(false)
  })

  it('includes whenToUse when present', async () => {
    const service = new SkillService(hostOnly(registryWith([summary({ name: 'alpha', whenToUse: 'use when' })])))
    const res = await service.list({ cwd: '/repo' })
    expect(res.skills[0]?.whenToUse).toBe('use when')
  })

  it('returns a warning when the registry seam is absent', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const service = new SkillService(hostOnly(undefined))
      const res = await service.list({ cwd: '/repo' })
      // Listing never throws: an absent seam is a SUCCESS with the detail as warning.
      expect(res.skills).toEqual([])
      expect(res.warning).toContain('skills/list failed:')
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('better-sidebar: skills/list failed, returning warning'))
    } finally {
      consoleError.mockRestore()
    }
  })

  it('addresses the per-agent scoped registry when a sessionId is present', async () => {
    const agent = { id: 's1' }
    const scopedList = vi.fn(async () => [summary({ name: 'scoped' })])
    const scopedRegistry = { list: scopedList } as unknown as SkillRegistry
    const service = new SkillService({
      getSkills: () => registryWith([]),
      getAgents: () => agentsWith(agent),
      getSession: () => undefined,
      getAgentPresets: () => presetsWith(scopedRegistry),
    })
    const res = await service.list({ cwd: '/repo', sessionId: 's1' })
    // The scoped registry (not the host one) is addressed, with the live agent
    // as the view scope and the cwd required for cwd-sensitive lookup.
    expect(scopedList).toHaveBeenCalledWith({ cwd: '/repo', scope: agent })
    expect(res.skills).toHaveLength(1)
    expect(res.skills[0]?.name).toBe('scoped')
  })

  it('uses the session preset standing key as the view scope when there is no live agent', async () => {
    const hostList = vi.fn(async () => [summary({ name: 'host' })])
    const standingKeyFor = vi.fn(async (id?: string) => ({ kind: 'standing', preset: id }))
    const service = new SkillService({
      getSkills: () => ({ list: hostList }) as unknown as SkillRegistry,
      getAgents: () => undefined,
      getSession: sessionStub,
      getAgentPresets: () => presetsWith(undefined, standingKeyFor),
    })
    // No live agent -> the host registry is addressed, scoped to the session
    // preset's STANDING key, so a fresh session still lists its full catalog.
    const res = await service.list({ cwd: '/repo', sessionId: 's1' })
    expect(standingKeyFor).toHaveBeenCalledWith('my-preset')
    expect(hostList).toHaveBeenCalledWith({ cwd: '/repo', scope: { kind: 'standing', preset: 'my-preset' } })
    expect(res.skills[0]?.name).toBe('host')
  })

  it('degrades a standingKeyFor rejection to the host-global scope, not an error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const hostList = vi.fn(async () => [summary({ name: 'host' })])
      const service = new SkillService({
        getSkills: () => ({ list: hostList }) as unknown as SkillRegistry,
        getAgents: () => undefined,
        getSession: sessionStub,
        getAgentPresets: () => presetsWith(undefined, async () => { throw new Error('boom: presets') }),
      })
      // A broken/unusable preset must degrade this read to the global scope,
      // never fail the listing.
      const res = await service.list({ cwd: '/repo', sessionId: 's1' })
      expect(hostList).toHaveBeenCalledWith({ cwd: '/repo' })
      expect(res.skills[0]?.name).toBe('host')
      expect(res.warning).toBeUndefined()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('falls back to the host registry when a sessionId matches no live agent', async () => {
    const hostList = vi.fn(async () => [summary({ name: 'host' })])
    const service = new SkillService({
      getSkills: () => ({ list: hostList }) as unknown as SkillRegistry,
      getAgents: () => agentsWith(undefined),
      getSession: () => undefined,
      getAgentPresets: () => presetsWith(undefined),
    })
    const res = await service.list({ cwd: '/repo', sessionId: 'missing' })
    // No live agent -> no scoped registry -> the host registry is addressed
    // with no scope (the global catalog), still cwd-scoped.
    expect(hostList).toHaveBeenCalledWith({ cwd: '/repo' })
    expect(res.skills[0]?.name).toBe('host')
  })

  it('converts a registry.list rejection into a success warning, logging the detail', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const error = new Error('boom: missing cwd')
      const registry = { list: async () => { throw error } } as unknown as SkillRegistry
      const service = new SkillService(hostOnly(registry))
      // Listing never throws: a registry error resolves to a SUCCESS result whose
      // `warning` string survives RPC value-slot serialization (the previous
      // thrown SidebarError did not reach the browser because the value-slot
      // error object is JSON-mangled).
      const res = await service.list({ cwd: '/repo', sessionId: 's9' })
      expect(res).toEqual({ skills: [], warning: expect.stringContaining('skills/list failed:') })
      // The concrete failure is logged (not swallowed) so the root cause is visible.
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('better-sidebar: skills/list failed, returning warning'))
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('boom: missing cwd'))
    } finally {
      consoleError.mockRestore()
    }
  })

  it('catches a throw from getAgentPresets() into the same warning shape', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const service = new SkillService({
        getSkills: () => registryWith([]),
        getAgents: () => agentsWith({ id: 's2' }),
        getSession: () => undefined,
        getAgentPresets: () => { throw new Error('boom: presets') },
      })
      const res = await service.list({ cwd: '/repo', sessionId: 's2' })
      expect(res).toEqual({ skills: [], warning: expect.stringContaining('skills/list failed:') })
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('better-sidebar: skills/list failed, returning warning'))
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('boom: presets'))
    } finally {
      consoleError.mockRestore()
    }
  })

  it('detail() loads a skill body and derives its resource references from readDir', async () => {
    const definition = definitionWithBase()
    const dir = '/repo/.dsh/skills/alpha'
    const refsDir = join(dir, 'references')
    const subDir = join(refsDir, 'sub')
    const emptyDir = join(dir, 'empty')
    const readDir = vi.fn(async (p: string) =>
      p === dir
        ? [
            dirEntry('SKILL.md', false), // the skill's own body — excluded from references
            dirEntry('references', true),
            dirEntry('guide.md', false),
            dirEntry('notes.txt', false),
            dirEntry('empty', true), // must contribute nothing — directories are not references
          ]
        : p === refsDir
          ? [dirEntry('notes.md', false), dirEntry('sub', true)]
          : p === subDir
            ? [dirEntry('deep.txt', false)]
            : [],
    ) as unknown as (dir: string) => Promise<Dirent[]>
    const service = new SkillService({
      getSkills: () => registryThatGets(definition),
      getAgents: () => undefined,
      getSession: () => undefined,
      getAgentPresets: () => undefined,
      readDir,
    })
    const res = await service.detail({ name: 'alpha', cwd: '/repo' })
    expect(res.found).toBe(true)
    expect(res.name).toBe('alpha')
    expect(res.description).toBe('Alpha thing')
    expect(res.whenToUse).toBe('use when X')
    expect(res.invocation).toEqual({ modelInvocable: true, userInvocable: false })
    expect(res.source).toBe('user-dsh')
    expect(res.provider).toBe('runtime')
    expect(res.content).toBe('# Alpha\nBody')
    expect(res.path).toBe('/repo/.dsh/skills/alpha/SKILL.md')
    expect(res.resourceDir).toBe('/repo/.dsh/skills/alpha')
    expect(res.warning).toBeUndefined()
    // The recursion descends into every subdirectory (root + each subdir).
    expect(readDir).toHaveBeenCalledTimes(4)
    expect(readDir).toHaveBeenCalledWith(dir)
    expect(readDir).toHaveBeenCalledWith(refsDir)
    expect(readDir).toHaveBeenCalledWith(subDir)
    expect(readDir).toHaveBeenCalledWith(emptyDir)
    // Files only, named relative to the resource dir with `/` separators,
    // sorted by name; SKILL.md (root) excluded; no directory references.
    expect(res.references).toEqual([
      { name: 'guide.md', path: join(dir, 'guide.md'), kind: 'file' },
      { name: 'notes.txt', path: join(dir, 'notes.txt'), kind: 'file' },
      { name: 'references/notes.md', path: join(refsDir, 'notes.md'), kind: 'file' },
      { name: 'references/sub/deep.txt', path: join(subDir, 'deep.txt'), kind: 'file' },
    ])
    expect(res.references.every(r => r.kind === 'file')).toBe(true)
  })

  it('detail() maps whenToUse/path/resourceDir only when present on the definition', async () => {
    const definition: SkillDefinition = {
      name: 'alpha',
      description: 'Alpha thing',
      invocation: { modelInvocable: true, userInvocable: true },
      source: 'bundled',
      provider: 'p',
      content: 'body',
    }
    const service = new SkillService(hostOnly(registryThatGets(definition)))
    const res = await service.detail({ name: 'alpha', cwd: '/repo' })
    expect(res.found).toBe(true)
    expect(res.content).toBe('body')
    expect(res.references).toEqual([])
    // exactOptionalPropertyTypes: absent optional fields must not ride undefined.
    expect(res.whenToUse).toBeUndefined()
    expect(Object.hasOwn(res, 'whenToUse')).toBe(false)
    expect(Object.hasOwn(res, 'path')).toBe(false)
    expect(Object.hasOwn(res, 'resourceDir')).toBe(false)
  })

  it('detail() returns found:false with a warning when registry.get() returns undefined', async () => {
    const service = new SkillService(hostOnly(registryThatGets(undefined)))
    const res = await service.detail({ name: 'ghost', cwd: '/repo' })
    expect(res.found).toBe(false)
    expect(res.warning).toBe('skill "ghost" not found')
    // Stable empty field values keep the wire shape consistent.
    expect(res.name).toBe('ghost')
    expect(res.description).toBe('')
    expect(res.invocation).toEqual({ modelInvocable: false, userInvocable: false })
    expect(res.source).toBe('')
    expect(res.provider).toBe('')
    expect(res.content).toBe('')
    expect(res.references).toEqual([])
  })

  it('detail() returns a skills/detail failed warning when the registry seam is absent', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const service = new SkillService(hostOnly(undefined))
      const res = await service.detail({ name: 'alpha', cwd: '/repo' })
      expect(res.found).toBe(false)
      expect(res.references).toEqual([])
      expect(res.warning).toContain('skills/detail failed:')
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('better-sidebar: skills/detail failed, returning warning'))
    } finally {
      consoleError.mockRestore()
    }
  })

  it('detail() resolves references to [] (still found) when readDir throws or no resource dir exists', async () => {
    // readDir rejects: the reference list degrades to empty, not a failure.
    const throwing = new SkillService({
      getSkills: () => registryThatGets(definitionWithBase()),
      getAgents: () => undefined,
      getSession: () => undefined,
      getAgentPresets: () => undefined,
      readDir: async () => { throw new Error('boom: readdir') },
    })
    const thrownRes = await throwing.detail({ name: 'alpha', cwd: '/repo' })
    expect(thrownRes.found).toBe(true)
    expect(thrownRes.references).toEqual([])

    // No resourceBase and no path -> no resource dir; readDir is never called.
    const readDir = vi.fn(async () => []) as unknown as (dir: string) => Promise<Dirent[]>
    const noDir = new SkillService({
      getSkills: () => registryThatGets({ name: 'alpha', description: 'd', invocation: { modelInvocable: true, userInvocable: true }, source: 's', provider: 'p', content: 'c' }),
      getAgents: () => undefined,
      getSession: () => undefined,
      getAgentPresets: () => undefined,
      readDir,
    })
    const noDirRes = await noDir.detail({ name: 'alpha', cwd: '/repo' })
    expect(noDirRes.found).toBe(true)
    expect(noDirRes.references).toEqual([])
    expect(readDir).not.toHaveBeenCalled()
  })

  it('detail() reads through the per-agent scoped registry with the session scope', async () => {
    const agent = { id: 's1' }
    const definition = definitionWithBase()
    const scopedGet = vi.fn(async () => definition)
    const scopedRegistry = { list: async () => [], get: scopedGet } as unknown as SkillRegistry
    const service = new SkillService({
      getSkills: () => registryThatGets(undefined),
      getAgents: () => agentsWith(agent),
      getSession: () => undefined,
      getAgentPresets: () => presetsWith(scopedRegistry),
    })
    const res = await service.detail({ name: 'alpha', cwd: '/repo', sessionId: 's1' })
    // The scoped registry (not the host one) is addressed, with the live agent
    // as the view scope and the cwd required for cwd-sensitive lookup.
    expect(scopedGet).toHaveBeenCalledWith('alpha', { cwd: '/repo', scope: agent })
    expect(res.found).toBe(true)
    expect(res.name).toBe('alpha')
  })
})