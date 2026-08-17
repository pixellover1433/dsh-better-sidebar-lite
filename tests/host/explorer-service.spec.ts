import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fsp } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { Dirent, Stats } from 'node:fs'
import { ExplorerService, mapFSError } from '../../src/host/explorer.ts'
import { fsNode } from '../../src/host/fs-node.ts'
import type { FsPort } from '../../src/host/port-fs.ts'

/* ------------------------------------------------------------------------
 * In-memory FsPort fake: deterministic sorting/hiding/caps/root-validation
 * tests without OS-specific permission flakiness.
 * ------------------------------------------------------------------------ */

interface FakeEntry {
  kind: 'dir' | 'file' | 'link'
  target?: string
  children?: Map<string, FakeEntry>
  /** Directory change stamp returned by stat (mtimeMs). */
  mtimeMs?: number
}

/** A Dirent-shaped object the fake returns from readdir. */
function fakeDirent(name: string, kind: 'dir' | 'file' | 'link'): Dirent {
  return {
    name,
    isDirectory: () => kind === 'dir',
    isFile: () => kind === 'file',
    isSymbolicLink: () => kind === 'link',
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
  } as Dirent
}

function fakeStats(kind: 'dir' | 'file', mtimeMs: number): Stats {
  return {
    isDirectory: () => kind === 'dir',
    isFile: () => kind === 'file',
    mtimeMs,
  } as Stats
}

/**
 * A tree-keyed FsPort. Paths are treated as absolute POSIX-style strings;
 * errors can be injected per-path for the mapping branches.
 */
class FakeFs implements FsPort {
  readonly sep = '/'
  caseInsensitive = false
  private readonly tree = new Map<string, FakeEntry>()
  private readonly statThrows = new Map<string, Error>()
  private readonly readdirThrows = new Map<string, Error>()

  /** Seed a one-level directory tree under `rootPath` (default '/root'), registering every path. */
  seed(children: Record<string, FakeEntry>, rootPath = '/root'): void {
    this.tree.set(rootPath, { kind: 'dir', children: new Map(Object.entries(children)) })
    for (const [name, child] of Object.entries(children)) {
      this.tree.set(rootPath.replace(/\/+$/, '') + '/' + name, child)
    }
  }

  throwOnStat(p: string, err: Error): void { this.statThrows.set(p, err) }
  throwOnReaddir(p: string, err: Error): void { this.readdirThrows.set(p, err) }

  /** Override the change stamp (mtimeMs) a stat of `p` reports. */
  setMtime(p: string, ms: number): void {
    const entry = this.tree.get(p)
    if (entry === undefined) throw new Error('setMtime: unknown path ' + p)
    entry.mtimeMs = ms
  }

  isAbsolute(p: string): boolean {
    return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p)
  }

  resolve(...parts: string[]): string {
    return parts.join('/').replace(/\\/g, '/')
  }

  isInside(child: string, base: string): boolean {
    const c = this.caseInsensitive ? child.toLowerCase() : child
    const b = this.caseInsensitive ? base.toLowerCase() : base
    if (c === b) return true
    const prefix = b.endsWith('/') ? b : b + '/'
    return c.startsWith(prefix)
  }

  async stat(p: string, opts?: { throwIfNoEntry?: false }): Promise<Stats | undefined> {
    const thrown = this.statThrows.get(p)
    if (thrown) throw thrown
    const entry = this.tree.get(p)
    if (entry === undefined) {
      if (opts?.throwIfNoEntry === false) return undefined
      throw errFor('ENOENT', 'stat')
    }
    return fakeStats(entry.kind === 'dir' ? 'dir' : 'file', entry.mtimeMs ?? 0)
  }

  async readdir(p: string, _opts: { withFileTypes: true }): Promise<Dirent[]> {
    const thrown = this.readdirThrows.get(p)
    if (thrown) throw thrown
    const entry = this.tree.get(p)
    if (entry === undefined || entry.kind !== 'dir') throw errFor('ENOENT', 'readdir')
    const out: Dirent[] = []
    for (const [name, child] of entry.children ?? []) {
      out.push(fakeDirent(name, child.kind))
    }
    return out
  }

  async readlink(p: string): Promise<string> {
    const entry = this.tree.get(p)
    if (entry === undefined || entry.kind !== 'link') throw errFor('ENOENT', 'readlink')
    return entry.target ?? ''
  }

  async realpath(p: string): Promise<string> { return p }
}

function errFor(code: string, syscall: string): NodeJS.ErrnoException {
  const e = new Error(`${syscall}: ${code}`) as NodeJS.ErrnoException
  e.code = code
  return e
}

const dir = (children: Record<string, FakeEntry>): FakeEntry => ({ kind: 'dir', children: new Map(Object.entries(children)) })
const file = (): FakeEntry => ({ kind: 'file' })
const link = (target: string): FakeEntry => ({ kind: 'link', target })

function makeService(fs: FsPort, opts?: Partial<{ maxEntries: number; hidePatterns: string[] }>) {
  return new ExplorerService(fs, {
    maxEntries: opts?.maxEntries ?? 2000,
    hidePatterns: opts?.hidePatterns ?? ['.git', 'node_modules'],
  })
}

describe('ExplorerService.list', () => {
  it('sorts directories first then files, locale-aware, with path tie-break', async () => {
    const fs = new FakeFs()
    fs.seed({
      zeta: dir({}),
      apple: file(),
      banana: file(),
      alpha_dir: dir({}),
    })
    const res = await makeService(fs).list({ path: '/root' })
    expect(res.entries.map(e => e.name)).toEqual(['alpha_dir', 'zeta', 'apple', 'banana'])
  })

  it('marks .git and node_modules hidden but leaves other dotfiles visible', async () => {
    const fs = new FakeFs()
    fs.seed({
      '.git': dir({}),
      node_modules: dir({}),
      '.env': file(),
    })
    const res = await makeService(fs).list({ path: '/root' })
    const byName = new Map(res.entries.map(e => [e.name, e]))
    expect(byName.get('.git')?.hidden).toBe(true)
    expect(byName.get('node_modules')?.hidden).toBe(true)
    expect(byName.get('.env')?.hidden).toBe(false)
  })

  it('reports symlinks with linkTarget and never follows them', async () => {
    const fs = new FakeFs()
    fs.seed({
      'link-to-dir': link('/real/dir'),
      regular: file(),
    })
    const res = await makeService(fs).list({ path: '/root' })
    const symlink = res.entries.find(e => e.name === 'link-to-dir')
    expect(symlink?.kind).toBe('symlink')
    expect(symlink?.linkTarget).toBe('/real/dir')
  })

  it('returns an empty listing for an empty directory', async () => {
    const fs = new FakeFs()
    fs.seed({})
    const res = await makeService(fs).list({ path: '/root' })
    expect(res.entries).toEqual([])
    expect(res.truncated).toBe(false)
  })

  it('truncates at maxEntries and reports truncation', async () => {
    const fs = new FakeFs()
    const many: Record<string, FakeEntry> = {}
    for (let i = 0; i < 20; i += 1) many[`f${String(i).padStart(2, '0')}`] = file()
    fs.seed(many)
    const service = makeService(fs, { maxEntries: 5 })
    const res = await service.list({ path: '/root' })
    expect(res.entries).toHaveLength(5)
    expect(res.truncated).toBe(true)
  })

  it('rejects a relative path as param-invalid', async () => {
    const fs = new FakeFs()
    fs.seed({})
    await expect(makeService(fs).list({ path: 'relative/dir' })).rejects.toMatchObject({ code: 'param-invalid' })
  })

  it('rejects a missing root as not-found', async () => {
    const fs = new FakeFs()
    fs.seed({})
    await expect(makeService(fs).list({ path: '/nope' })).rejects.toMatchObject({ code: 'not-found' })
  })

  it('rejects a file root as not-directory', async () => {
    const fs = new FakeFs()
    fs.seed({ somefile: file() })
    await expect(makeService(fs).list({ path: '/root/somefile' })).rejects.toMatchObject({ code: 'not-directory' })
  })

  it('rejects a root outside allowedRoots as outside-allowed-root', async () => {
    const fs = new FakeFs()
    fs.seed({})
    const service = new ExplorerService(fs, { maxEntries: 2000, hidePatterns: [], allowedRoots: ['/allowed'] })
    await expect(service.list({ path: '/root' })).rejects.toMatchObject({ code: 'outside-allowed-root' })
  })

  it('accepts a root inside an allowed root', async () => {
    const fs = new FakeFs()
    fs.seed({ child: dir({}) })
    const service = new ExplorerService(fs, { maxEntries: 2000, hidePatterns: [], allowedRoots: ['/root'] })
    const res = await service.list({ path: '/root/child' })
    expect(res.path).toBe('/root/child')
  })

  it('is case-insensitive on Windows-style containment', async () => {
    const fs = new FakeFs()
    fs.seed({ inner: file() }, 'C:/ROOT')
    fs.caseInsensitive = true
    const service = new ExplorerService(fs, { maxEntries: 2000, hidePatterns: [], allowedRoots: ['C:/Root'] })
    const res = await service.list({ path: 'C:/ROOT' })
    expect(res.path).toBe('C:/ROOT')
    expect(res.entries.map(e => e.name)).toEqual(['inner'])
  })

  it('maps fs errors via mapFSError', async () => {
    expect(mapFSError(errFor('ENOENT', 'stat'), '/x').code).toBe('not-found')
    expect(mapFSError(errFor('EACCES', 'stat'), '/x').code).toBe('permission-denied')
    expect(mapFSError(errFor('EPERM', 'stat'), '/x').code).toBe('permission-denied')
    expect(mapFSError(errFor('ENOTDIR', 'stat'), '/x').code).toBe('not-directory')
    expect(mapFSError(errFor('ELOOP', 'stat'), '/x').code).toBe('symlink-loop')
    expect(mapFSError(new Error('boom'), '/x').code).toBe('internal')
  })

  it('surfaces a readdir failure through the service', async () => {
    const fs = new FakeFs()
    fs.seed({})
    fs.throwOnReaddir('/root', errFor('EACCES', 'readdir'))
    await expect(makeService(fs).list({ path: '/root' })).rejects.toMatchObject({ code: 'permission-denied' })
  })
})

describe('ExplorerService.stamp (auto-refresh sweep)', () => {
  it('returns a stamp per requested dir, echoing the root', async () => {
    const fs = new FakeFs()
    fs.seed({ child: dir({}), leaf: file() })
    fs.setMtime('/root', 100)
    fs.setMtime('/root/child', 200)
    const res = await makeService(fs).stamp({ path: '/root', dirs: ['/root', '/root/child'] })
    expect(res.path).toBe('/root')
    expect(res.stamps).toEqual({ '/root': 100, '/root/child': 200 })
  })

  it('stamps a vanished dir undefined without failing the sweep', async () => {
    const fs = new FakeFs()
    fs.seed({})
    fs.setMtime('/root', 100)
    const res = await makeService(fs).stamp({ path: '/root', dirs: ['/root', '/root/gone'] })
    expect(res.stamps['/root']).toBe(100)
    expect(res.stamps['/root/gone']).toBeUndefined()
  })

  it('stamps undefined for a dir outside the root (no stat reach outside the fence)', async () => {
    const fs = new FakeFs()
    fs.seed({}, '/root')
    fs.seed({}, '/elsewhere')
    fs.setMtime('/root', 5)
    fs.setMtime('/elsewhere', 9)
    const res = await makeService(fs).stamp({ path: '/root', dirs: ['/root', '/elsewhere'] })
    expect(res.stamps).toEqual({ '/root': 5, '/elsewhere': undefined })
  })

  it('stamps undefined for a relative dir', async () => {
    const fs = new FakeFs()
    fs.seed({})
    fs.setMtime('/root', 7)
    const res = await makeService(fs).stamp({ path: '/root', dirs: ['/root', 'relative/dir'] })
    expect(res.stamps).toEqual({ '/root': 7, 'relative/dir': undefined })
  })

  it('dedupes repeated dirs in one request', async () => {
    const fs = new FakeFs()
    fs.seed({})
    fs.setMtime('/root', 7)
    const res = await makeService(fs).stamp({ path: '/root', dirs: ['/root', '/root', '/root'] })
    expect(res.stamps).toEqual({ '/root': 7 })
  })

  it('validates the root like a list: a missing root fails the whole sweep', async () => {
    const fs = new FakeFs()
    fs.seed({})
    await expect(makeService(fs).stamp({ path: '/nope', dirs: ['/nope'] })).rejects.toMatchObject({ code: 'not-found' })
  })

  it('rejects a non-directory root', async () => {
    const fs = new FakeFs()
    fs.seed({ f: file() })
    await expect(makeService(fs).stamp({ path: '/root/f', dirs: ['/root/f'] })).rejects.toMatchObject({ code: 'not-directory' })
  })

  it('honours allowedRoots for the sweep root', async () => {
    const fs = new FakeFs()
    fs.seed({})
    const service = new ExplorerService(fs, { maxEntries: 2000, hidePatterns: [], allowedRoots: ['/allowed'] })
    await expect(service.stamp({ path: '/root', dirs: ['/root'] })).rejects.toMatchObject({ code: 'outside-allowed-root' })
  })

  it('surfaces a stat failure of a polled dir through the sweep', async () => {
    const fs = new FakeFs()
    fs.seed({ child: dir({}) })
    fs.throwOnStat('/root/child', errFor('EACCES', 'stat'))
    await expect(makeService(fs).stamp({ path: '/root', dirs: ['/root', '/root/child'] })).rejects.toMatchObject({ code: 'permission-denied' })
  })
})

describe('ExplorerService.stamp on the real fs', () => {
  let root: string

  beforeEach(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'bslite-stamp-'))
    await fsp.mkdir(path.join(root, 'sub'))
  })

  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true })
  })

  it('moves a directory stamp when a child is added', async () => {
    const service = new ExplorerService(fsNode, { maxEntries: 2000, hidePatterns: [] })
    const sub = path.join(root, 'sub')
    const before = await service.stamp({ path: root, dirs: [root, sub] })
    // Sleep past any 1s timestamp granularity so the added file's parent-dir
    // mtime is guaranteed to land in a different bucket than the original.
    await new Promise(resolve => setTimeout(resolve, 1100))
    await fsp.writeFile(path.join(sub, 'new.txt'), 'x', 'utf8')
    const after = await service.stamp({ path: root, dirs: [root, sub] })
    expect(after.stamps[sub]).not.toBe(before.stamps[sub])
  })

  it('stamps a deleted directory undefined', async () => {
    const service = new ExplorerService(fsNode, { maxEntries: 2000, hidePatterns: [] })
    const sub = path.join(root, 'sub')
    const before = await service.stamp({ path: root, dirs: [sub] })
    expect(before.stamps[sub]).not.toBeUndefined()
    await fsp.rm(sub, { recursive: true, force: true })
    const after = await service.stamp({ path: root, dirs: [sub] })
    expect(after.stamps[sub]).toBeUndefined()
  })
})

describe('ExplorerService.list on the real fs', () => {
  let root: string
  let skipSymlink = false

  beforeEach(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'bslite-explorer-'))
    await fsp.writeFile(path.join(root, 'a.txt'), 'a', 'utf8')
    await fsp.mkdir(path.join(root, 'sub'))
    await fsp.writeFile(path.join(root, 'sub', 'b.txt'), 'b', 'utf8')
    try {
      await fsp.symlink(path.join(root, 'a.txt'), path.join(root, 'link-a.txt'), 'file')
    } catch {
      skipSymlink = true // Windows without Developer Mode cannot create file symlinks
    }
  })

  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true })
  })

  it('lists a real dir with a file symlink reported as symlink', async () => {
    const service = new ExplorerService(fsNode, { maxEntries: 2000, hidePatterns: ['.git', 'node_modules'] })
    const res = await service.list({ path: root })
    const names = res.entries.map(e => e.name)
    expect(names).toEqual(['sub', 'a.txt', ...(skipSymlink ? [] : ['link-a.txt'])])
    if (!skipSymlink) {
      const link = res.entries.find(e => e.name === 'link-a.txt')
      expect(link?.kind).toBe('symlink')
      expect(link?.linkTarget).toBe(path.join(root, 'a.txt'))
    }
  })

  it('lists a nested directory level', async () => {
    const service = new ExplorerService(fsNode, { maxEntries: 2000, hidePatterns: [] })
    const res = await service.list({ path: path.join(root, 'sub') })
    expect(res.entries.map(e => e.name)).toEqual(['b.txt'])
  })
})