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
