import { describe, expect, it } from 'vitest'
import { CONTRACT_VERSION } from '../../src/contract/index.ts'

describe('host toolchain', () => {
  it('resolves workspace sources and dsh junction types', async () => {
    // Type-level proof: dsh cordis types resolve through the junction.
    const mod = await import('@deepseek-ai/cordis')
    expect(typeof mod.Context).toBe('function')
    expect(CONTRACT_VERSION).toBe('0.1.0')
  })
})