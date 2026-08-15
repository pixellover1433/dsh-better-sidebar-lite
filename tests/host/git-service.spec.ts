import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GitService } from '../../src/host/git.ts'
import { GitRunner } from '../../src/host/git-runner.ts'
import { createCommitFilesRepo, createLogRepo, createStatusRepo, gitAvailable, type CommitFilesRepo, type ScriptedRepo } from './fixtures/scripted-git.ts'

const makeGit = (overrides?: Partial<ConstructorParameters<typeof GitRunner>[0]>) =>
  new GitRunner({ timeoutMs: 15_000, ...overrides })

const makeService = (runner: GitRunner) =>
  new GitService(runner, { maxLogEntries: 100, maxStatusEntries: 20_000, untrackedFiles: 'all' })

describe('GitService over a scripted repo', () => {
  let repo: ScriptedRepo
  afterEach(async () => { await repo?.cleanup() })

  const itGit = it.skipIf(!gitAvailable())

  itGit('groups changes into staged/unstaged/untracked and reports head', async () => {
    repo = await createStatusRepo()
    const service = makeService(makeGit({}))
    const res = await service.status({ path: repo.root })
    if (!res.ok) throw new Error('expected ok, got ' + JSON.stringify(res.error))
    expect(res.value.head).toBe('main')
    expect(res.value.truncated).toBe(false)
    const names = (list: readonly { path: string }[]) => list.map(e => e.path).sort()
    expect(names(res.value.staged)).toEqual(['moved.txt', 'staged-new.txt'])
    expect(names(res.value.unstaged)).toEqual(['base.txt'])
    expect(names(res.value.untracked)).toContain('untracked.txt')
    expect(names(res.value.untracked)).toContain('lib/inner.txt')
    expect(res.value.conflicted).toEqual([])
  })

  itGit('reports a staged rename with its original path', async () => {
    repo = await createStatusRepo()
    const service = makeService(makeGit({}))
    const res = await service.status({ path: repo.root })
    if (!res.ok) throw new Error('expected ok')
    const rename = res.value.staged.find(e => e.path === 'moved.txt')
    expect(rename?.originalPath).toBe('renamed.txt')
    expect(rename?.xy.trim().startsWith('R')).toBe(true)
  })

  itGit('collapses an untracked directory in normal mode with a trailing slash', async () => {
    repo = await createStatusRepo()
    const runner = makeGit({})
    const service = new GitService(runner, { maxLogEntries: 100, maxStatusEntries: 20_000, untrackedFiles: 'normal' })
    const res = await service.status({ path: repo.root })
    if (!res.ok) throw new Error('expected ok')
    expect(res.value.untracked.some(e => e.path === 'lib/')).toBe(true)
  })

  itGit('pages the log newest-first and reports truncation', async () => {
    repo = await createLogRepo()
    const service = makeService(makeGit({}))
    const res = await service.log({ path: repo.root, limit: 2 })
    if (!res.ok) throw new Error('expected ok')
    expect(res.value.entries).toHaveLength(2)
    expect(res.value.truncated).toBe(true)
    expect(res.value.head).toBe('main')
    expect(res.value.entries[0]?.subject).toBe('commit 4')
    expect(res.value.entries[1]?.subject).toBe('commit 3')
  })

  itGit('returns the full log when the page is not exceeded', async () => {
    repo = await createLogRepo()
    const service = makeService(makeGit({}))
    const res = await service.log({ path: repo.root })
    if (!res.ok) throw new Error('expected ok')
    expect(res.value.entries).toHaveLength(4)
    expect(res.value.truncated).toBe(false)
  })

  it('returns not-a-repo for a plain empty directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bslite-plain-'))
    try {
      const service = makeService(makeGit({}))
      const res = await service.status({ path: dir })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error.code).toBe('not-a-repo')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('GitRunner classification', () => {
  it('classifies a missing executable as git-missing', async () => {
    const runner = makeGit({ executable: 'definitely-not-a-git-bin', timeoutMs: 1000 })
    const res = await runner.run(['--version'], process.cwd())
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.kind).toBe('git-missing')
  })

  it('classifies an externally-aborted run as cancelled', async () => {
    const runner = makeGit({ executable: process.execPath, timeoutMs: 10_000 })
    const ctrl = new AbortController()
    const pending = runner.run(['-e', 'setTimeout(() => {}, 5000)'], process.cwd(), ctrl.signal)
    setTimeout(() => ctrl.abort(), 100)
    const res = await pending
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.kind).toBe('cancelled')
  })

  it('classifies an expired timeout as timeout', async () => {
    const runner = makeGit({ executable: process.execPath, timeoutMs: 100 })
    const res = await runner.run(['-e', 'setTimeout(() => {}, 5000)'], process.cwd())
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.kind).toBe('timeout')
  })

  it('classifies a non-repo cwd from the runner directly as not-a-repo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bslite-gitnull-'))
    try {
      const runner = makeGit({})
      const res = await runner.run(['status'], dir)
      if (res.ok) throw new Error('expected failure')
      expect(res.kind).toBe('not-a-repo')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
describe('GitService.commitFiles over a scripted repo', () => {
  let repo: CommitFilesRepo
  afterEach(async () => { await repo?.cleanup() })

  const itGit = it.skipIf(!gitAvailable())

  itGit('lists the files changed by a mixed add/modify/delete commit', async () => {
    repo = await createCommitFilesRepo()
    const service = makeService(makeGit({}))
    const res = await service.commitDetail({ path: repo.root, hash: repo.mixedCommit })
    if (!res.ok) throw new Error('expected ok, got ' + JSON.stringify(res.error))
    const byPath = Object.fromEntries(res.value.files.map((f: { path: string; status: string }) => [f.path, f.status]))
    expect(byPath).toEqual({ 'a.txt': 'M', 'b.txt': 'D', 'c.txt': 'A' })
  })

  itGit('returns the full commit message (subject + body)', async () => {
    repo = await createCommitFilesRepo()
    const service = makeService(makeGit({}))
    const res = await service.commitDetail({ path: repo.root, hash: repo.mixedCommit })
    if (!res.ok) throw new Error('expected ok')
    expect(res.value.message).toContain('add modify delete')
  })

  itGit('lists a root commit with --root as pure additions', async () => {
    repo = await createCommitFilesRepo()
    const service = makeService(makeGit({}))
    const res = await service.commitDetail({ path: repo.root, hash: repo.rootCommit })
    if (!res.ok) throw new Error('expected ok')
    expect(res.value.files.map(f => f.status)).toEqual(['A', 'A'])
    expect(res.value.files.map(f => f.path).sort()).toEqual(['a.txt', 'b.txt'])
  })

  itGit('reports a rename with its source and score', async () => {
    repo = await createCommitFilesRepo()
    const service = makeService(makeGit({}))
    const res = await service.commitDetail({ path: repo.root, hash: repo.renameCommit })
    if (!res.ok) throw new Error('expected ok')
    expect(res.value.files).toHaveLength(1)
    expect(res.value.files[0]).toMatchObject({ status: 'R', path: 'moved.txt', originalPath: 'a.txt' })
  })

  itGit('returns not-a-repo for a plain directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bslite-cf-'))
    try {
      const service = makeService(makeGit({}))
      const res = await service.commitDetail({ path: dir, hash: 'deadbeef' })
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error.code).toBe('not-a-repo')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  itGit('commits staged files and returns the new hash', async () => {
    const commitRepo = await createCommitFilesRepo()
    const { root } = commitRepo
    const service = makeService(makeGit({}))
    // stage a modification to base, then commit
    const rootFs = await import('node:fs/promises')
    await rootFs.appendFile(join(root, 'c.txt'), 'more\n')
    const stageC = await service.stage({ path: root, files: ['c.txt'] })
    expect(stageC.ok).toBe(true)
    const res = await service.commit({ path: root, message: 'test commit\n\nbody line', files: [] })
    if (!res.ok) throw new Error('expected ok, got ' + JSON.stringify(res.error))
    expect(res.value.hash).toMatch(/^[0-9a-f]{40}$/)
    const after = await service.log({ path: root, limit: 1 })
    if (!after.ok) throw new Error('expected ok')
    expect(after.value.entries[0]?.subject).toBe('test commit')
    await commitRepo.cleanup()
  })

  itGit('discards a tracked modification (restore worktree)', async () => {
    const local = await createStatusRepo()
    const { root } = local
    const service = makeService(makeGit({}))
    // base.txt is unstaged-modified.
    const res = await service.discard({ path: root, files: ['base.txt'] })
    expect(res.ok).toBe(true)
    const status = await service.status({ path: root })
    if (!status.ok) throw new Error('expected ok')
    expect(status.value.unstaged.map(e => e.path)).not.toContain('base.txt')
    await local.cleanup()
  })

  itGit('discards an untracked file (clean)', async () => {
    const local = await createStatusRepo()
    const { root } = local
    const service = makeService(makeGit({}))
    const res = await service.discard({ path: root, files: ['untracked.txt'] })
    expect(res.ok).toBe(true)
    const status = await service.status({ path: root })
    if (!status.ok) throw new Error('expected ok')
    expect(status.value.untracked.map(e => e.path)).not.toContain('untracked.txt')
    await local.cleanup()
  })

  itGit('rejects a commit with an empty message', async () => {
    const local = await createStatusRepo()
    const { root } = local
    const service = makeService(makeGit({}))
    const res = await service.commit({ path: root, message: '   ', files: [] })
    expect(res.ok).toBe(false)
    await local.cleanup()
  })

})