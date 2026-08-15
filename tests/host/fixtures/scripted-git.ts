/**
 * Scripted real git repo fixtures (d8 §2.3, D6 §7.2). Each scenario builds a
 * throwaway repo under the OS temp dir with a pinned identity so assertions
 * are deterministic and never depend on a global git config. Tests own the
 * returned root and must call cleanup() in afterEach.
 */
import { execFileSync } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

/** Repo identity pinned locally so commits need no global git config. */
const IDENTITY = ['-c', 'user.name=Test User', '-c', 'user.email=test@example.test']

/** True when a usable git 2.x is on PATH. Tests may skip gracefully when absent. */
export function gitAvailable(): boolean {
  try {
    const out = execFileSync('git', ['--version'], { encoding: 'utf8' })
    return /^git version \d+\./i.test(out.trim())
  } catch {
    return false
  }
}

/** A freshly minted repo the caller must clean up. */
export interface ScriptedRepo {
  /** Absolute worktree root. */
  root: string
  /** Remove the temp directory. */
  cleanup: () => Promise<void>
}

function git(root: string, ...args: string[]): void {
  execFileSync('git', [...IDENTITY, ...args], { cwd: root, stdio: 'pipe' })
}

/** Write a UTF-8 file and fail loudly if a parent is missing. */
async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const abs = path.join(root, rel)
  await fsp.mkdir(path.dirname(abs), { recursive: true })
  await fsp.writeFile(abs, content, 'utf8')
}

/** stage every file then commit. */
function commit(root: string, message: string): void {
  git(root, 'add', '-A')
  git(root, 'commit', '-m', message)
}

async function makeRepo(): Promise<ScriptedRepo> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'bslite-git-'))
  git(root, 'init', '-q', '-b', 'main')
  return { root, cleanup: () => fsp.rm(root, { recursive: true, force: true }) }
}

/**
 * A repo with staged rename, staged add, unstaged mod, an untracked file, and
 * an untracked directory, sitting on top of two commits. Suitable for status
 * group assertions.
 */
export async function createStatusRepo(): Promise<ScriptedRepo> {
  const repo = await makeRepo()
  const { root } = repo
  await writeFile(root, 'base.txt', 'base\n')
  await writeFile(root, 'renamed.txt', 'rename me\n')
  commit(root, 'initial')
  await writeFile(root, 'tracked-only.txt', 'tracked\n')
  commit(root, 'add tracked')
  // Staged rename (index R, worktree clean).
  git(root, 'mv', 'renamed.txt', 'moved.txt')
  // Staged new file.
  await writeFile(root, 'staged-new.txt', 'staged\n')
  git(root, 'add', 'staged-new.txt')
  // Unstaged modification of a tracked file.
  await fsp.writeFile(path.join(root, 'base.txt'), 'base changed\n', 'utf8')
  // Untracked file.
  await writeFile(root, 'untracked.txt', 'untracked\n')
  // Untracked directory (collapsed to 'lib/' in normal mode).
  await writeFile(root, 'lib/inner.txt', 'inner\n')
  return repo
}

/**
 * A repo with a minimum of 3 commits plus several, for log paging/truncation
 * assertions. Returns the list of commit messages in order (oldest first).
 */
export async function createLogRepo(): Promise<ScriptedRepo> {
  const repo = await makeRepo()
  const { root } = repo
  for (let i = 1; i <= 4; i += 1) {
    await writeFile(root, `f${String(i)}.txt`, `v${String(i)}\n`)
    commit(root, `commit ${String(i)}`)
  }
  return repo
}

/**
 * A repo with a root commit, an add/modify/delete commit, and a rename commit
 * — for commit-files (git diff-tree --name-status) assertions. Exports the
 * commit hashes so tests can address each revision.
 */
export interface CommitFilesRepo extends ScriptedRepo {
  rootCommit: string
  mixedCommit: string
  renameCommit: string
}

export async function createCommitFilesRepo(): Promise<CommitFilesRepo> {
  const repo = await makeRepo()
  const { root } = repo
  await writeFile(root, 'a.txt', 'a\n')
  await writeFile(root, 'b.txt', 'b\n')
  commit(root, 'initial')
  const rootCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  await writeFile(root, 'c.txt', 'c\n')
  await fsp.writeFile(path.join(root, 'a.txt'), 'a2\n', 'utf8')
  await fsp.rm(path.join(root, 'b.txt'))
  commit(root, 'add modify delete')
  const mixedCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  git(root, 'mv', 'a.txt', 'moved.txt')
  commit(root, 'rename a')
  const renameCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  return { root, rootCommit, mixedCommit, renameCommit, cleanup: repo.cleanup }
}
