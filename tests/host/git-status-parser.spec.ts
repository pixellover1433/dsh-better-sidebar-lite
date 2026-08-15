import { describe, expect, it } from 'vitest'
import { parsePorcelainV1Z } from '../../src/host/git-status-parser.ts'
import { parseNameStatus } from '../../src/host/git.ts'

function toBytes(s: string): Buffer {
  return Buffer.from(s, 'utf8')
}

describe('parsePorcelainV1Z', () => {
  it('parses an empty buffer to no entries', () => {
    expect(parsePorcelainV1Z(new Uint8Array(0))).toEqual([])
  })

  it('parses a staged modification (index M)', () => {
    const entries = parsePorcelainV1Z(toBytes('M  file.txt\x00'))
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      xy: 'M ',
      path: 'file.txt',
      staged: true,
      unstaged: false,
      untracked: false,
      conflicted: false,
      submodule: false,
    })
  })

  it('parses an unstaged modification (worktree M)', () => {
    const entries = parsePorcelainV1Z(toBytes(' M file.txt\x00'))
    expect(entries[0]).toMatchObject({ staged: false, unstaged: true, untracked: false })
  })

  it('parses a both-staged-and-unstaged modification (MM)', () => {
    const entries = parsePorcelainV1Z(toBytes('MM file.txt\x00'))
    expect(entries[0]).toMatchObject({ staged: true, unstaged: true, untracked: false })
  })

  it('parses untracked (??)', () => {
    const entries = parsePorcelainV1Z(toBytes('?? new.txt\x00'))
    expect(entries[0]).toMatchObject({ staged: false, unstaged: false, untracked: true })
  })

  it('keeps the trailing slash on a collapsed untracked directory (normal mode)', () => {
    const entries = parsePorcelainV1Z(toBytes('?? lib/\x00'))
    expect(entries[0]).toMatchObject({ path: 'lib/', untracked: true })
  })

  it('parses several records separated only by NUL, including paths with spaces', () => {
    const entries = parsePorcelainV1Z(toBytes(' M a b.txt\x00?? c d.txt\x00M  e.txt\x00'))
    expect(entries.map(e => ({ xy: e.xy, path: e.path }))).toEqual([
      { xy: ' M', path: 'a b.txt' },
      { xy: '??', path: 'c d.txt' },
      { xy: 'M ', path: 'e.txt' },
    ])
  })

  it('parses a rename as destination-then-source (path = dest, originalPath = source)', () => {
    const entries = parsePorcelainV1Z(toBytes('R  moved.txt\x00renamed.txt\x00'))
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      xy: 'R ',
      path: 'moved.txt',
      originalPath: 'renamed.txt',
      staged: true,
    })
  })

  it('treats unmerged pairs as conflicted-only (UU)', () => {
    const entries = parsePorcelainV1Z(toBytes('UU conflict.txt\x00'))
    expect(entries[0]).toMatchObject({
      xy: 'UU',
      path: 'conflict.txt',
      conflicted: true,
      staged: false,
      unstaged: false,
      untracked: false,
    })
  })

  it('marks unmerged DD/AA pairs as conflicted', () => {
    expect(parsePorcelainV1Z(toBytes('DD gone.txt\x00'))[0]?.conflicted).toBe(true)
    expect(parsePorcelainV1Z(toBytes('AA added.txt\x00'))[0]?.conflicted).toBe(true)
  })

  it('flags a submodule entry via S in either column', () => {
    const staged = parsePorcelainV1Z(toBytes('S  sub\x00'))[0]
    expect(staged?.submodule).toBe(true)
    const dirty = parsePorcelainV1Z(toBytes(' S sub\x00'))[0]
    expect(dirty?.submodule).toBe(true)
  })

  it('round-trips non-ASCII (UTF-8) paths', () => {
    const entries = parsePorcelainV1Z(toBytes('?? café.txt\x00'))
    expect(entries[0]?.path).toBe('café.txt')
  })

  it('stops at the first malformed record instead of crashing', () => {
    // Missing leading two-letter header + space is skipped because i+4 gate fails.
    expect(parsePorcelainV1Z(toBytes('garbage\x00'))).toEqual([])
  })
})
describe('parseNameStatus (git diff-tree --name-status -z)', () => {
  const b = (s: string) => Buffer.from(s, 'utf8')

  it('parses add/modify/delete records (one field per NUL record)', () => {
    const files = parseNameStatus(b('M\0a.txt\0D\0b.txt\0A\0c.txt\0'))
    expect(files).toEqual([
      { status: 'M', path: 'a.txt' },
      { status: 'D', path: 'b.txt' },
      { status: 'A', path: 'c.txt' },
    ])
  })

  it('parses a rename with its score and source-first order', () => {
    const files = parseNameStatus(b('R100\0a.txt\0moved.txt\0'))
    expect(files).toEqual([{ status: 'R', path: 'moved.txt', originalPath: 'a.txt', score: 100 }])
  })

  it('parses a copy with its score', () => {
    const files = parseNameStatus(b('C075\0src.ts\0copy.ts\0'))
    expect(files).toEqual([{ status: 'C', path: 'copy.ts', originalPath: 'src.ts', score: 75 }])
  })

  it('handles paths with spaces (no C-quoting under -z)', () => {
    const files = parseNameStatus(b('M\0my file.txt\0'))
    expect(files).toEqual([{ status: 'M', path: 'my file.txt' }])
  })

  it('returns [] for empty output', () => {
    expect(parseNameStatus(b(''))).toEqual([])
  })

  it('stops cleanly at a truncated trailing record', () => {
    const files = parseNameStatus(b('R100\0only-one-field\0'))
    expect(files).toEqual([])
  })
})