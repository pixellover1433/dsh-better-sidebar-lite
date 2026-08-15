/**
 * Git tab definition factory tests: verifies createGitTabDef returns the
 * documented TabDef shape (ADR-003/004). The factory binds its namespace
 * translate via ctx.locale, so a minimal fake ctx is supplied.
 */
import { describe, expect, it } from 'vitest'
import { isValidElement } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { BetterSidebarRpc } from '../../../../src/client/rpc-client.ts'
import { createGitTabDef } from '../../../../src/client/tabs/git/tab-def.ts'

/** Bound translate stub: returns its key verbatim. */
function fakeCtx(): ClientContext {
  return {
    locale: {
      bind: () => (key: string) => key,
    },
  } as unknown as ClientContext
}

const rpc = {} as BetterSidebarRpc

describe('createGitTabDef', () => {
  it('returns the documented tab definition', () => {
    const def = createGitTabDef(fakeCtx(), { rpc })
    expect(def.id).toBe('git')
    expect(def.order).toBe(20)
    expect(typeof def.label).toBe('function')
    expect((def.label as () => string)()).toBe('tabLabel')
    expect(isValidElement(def.icon)).toBe(true)
    expect(def.badge).toBeUndefined()
  })

  it('renderPanel produces a panel element', () => {
    const def = createGitTabDef(fakeCtx(), { rpc })
    const panel = def.renderPanel()
    expect(isValidElement(panel)).toBe(true)
  })
})
