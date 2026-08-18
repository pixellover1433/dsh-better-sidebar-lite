/**
 * Contract payload-guard tests for the open-file (explorer/read) endpoint
 * (ADR-002). Guards are hand-rolled type predicates shared by host dispatch and
 * the client facade; pinned here so a payload-shape change fails loudly.
 */
import { describe, expect, it } from 'vitest'
import {
  Endpoints,
  HOST_DEFAULTS,
  isExplorerReadRequest,
  isGitDiffRequest,
} from '../../src/contract/index.ts'

describe('explorer/read endpoint', () => {
  it('registers the endpoint with a stable wire name', () => {
    expect(Endpoints.explorerRead).toBe('explorer/read')
  })

  it('accepts an object with a non-empty path within the length cap', () => {
    expect(isExplorerReadRequest({ path: '/workspace/file.txt' })).toBe(true)
  })

  it('rejects non-object payloads', () => {
    expect(isExplorerReadRequest(undefined)).toBe(false)
    expect(isExplorerReadRequest(null)).toBe(false)
    expect(isExplorerReadRequest('path')).toBe(false)
    expect(isExplorerReadRequest(['/x'])).toBe(false)
  })

  it('rejects a missing, empty, or non-string path', () => {
    expect(isExplorerReadRequest({})).toBe(false)
    expect(isExplorerReadRequest({ path: '' })).toBe(false)
    expect(isExplorerReadRequest({ path: 42 })).toBe(false)
    expect(isExplorerReadRequest({ path: '/x', extra: 'ignored' })).toBe(true)
  })

  it('rejects an implausibly long path beyond the request cap', () => {
    const path = '/'.repeat(HOST_DEFAULTS.maxRequestPathLength + 1)
    expect(isExplorerReadRequest({ path })).toBe(false)
  })
})

describe('git/diff endpoint', () => {
  it('registers the endpoint with a stable wire name', () => {
    expect(Endpoints.gitDiff).toBe('git/diff')
  })

  it('accepts a valid payload for either diff base', () => {
    expect(isGitDiffRequest({ path: '/workspace', file: 'src/a.ts', base: 'index' })).toBe(true)
    expect(isGitDiffRequest({ path: '/workspace', file: 'src/a.ts', base: 'head' })).toBe(true)
  })

  it('rejects a non-object payload', () => {
    expect(isGitDiffRequest(undefined)).toBe(false)
    expect(isGitDiffRequest(null)).toBe(false)
    expect(isGitDiffRequest('path')).toBe(false)
  })

  it('rejects a missing or non-string path', () => {
    expect(isGitDiffRequest({ file: 'a.ts', base: 'index' })).toBe(false)
    expect(isGitDiffRequest({ path: '', file: 'a.ts', base: 'index' })).toBe(false)
    expect(isGitDiffRequest({ path: 42, file: 'a.ts', base: 'index' })).toBe(false)
  })

  it('rejects an invalid or unknown diff base', () => {
    expect(isGitDiffRequest({ path: '/workspace', file: 'a.ts', base: 'working' })).toBe(false)
    expect(isGitDiffRequest({ path: '/workspace', file: 'a.ts', base: 'HEAD' })).toBe(false)
    expect(isGitDiffRequest({ path: '/workspace', file: 'a.ts' })).toBe(false)
  })

  it('rejects an unsafe or empty file path (path-safety like stage/discard)', () => {
    expect(isGitDiffRequest({ path: '/workspace', file: '', base: 'index' })).toBe(false)
    expect(isGitDiffRequest({ path: '/workspace', file: '/abs/path', base: 'index' })).toBe(false)
    expect(isGitDiffRequest({ path: '/workspace', file: '..', base: 'index' })).toBe(false)
    expect(isGitDiffRequest({ path: '/workspace', file: '../escape', base: 'index' })).toBe(false)
    expect(isGitDiffRequest({ path: '/workspace', file: 'some/../escape', base: 'index' })).toBe(false)
  })
})
