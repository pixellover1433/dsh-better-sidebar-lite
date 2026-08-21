/**
 * Skills tab definition factory tests: verifies createSkillsTabDef returns the
 * documented TabDef shape (ADR-003/004). The factory binds its namespace
 * translate via ctx.locale, so a minimal fake ctx is supplied.
 */
import { describe, expect, it } from 'vitest'
import { isValidElement } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { BetterSidebarRpc } from '../../../../src/client/rpc-client.ts'
import { createSkillsTabDef } from '../../../../src/client/tabs/skills/tab-def.ts'
import { ExplorerOpenFileEmitter } from '../../../../src/client/tabs/explorer/events.ts'

/** Bound translate stub: returns its key verbatim. */
function fakeCtx(): ClientContext {
  return {
    locale: {
      bind: () => (key: string) => key,
    },
  } as unknown as ClientContext
}

const rpc = {} as BetterSidebarRpc

describe('createSkillsTabDef', () => {
  it('returns the documented tab definition', () => {
    const def = createSkillsTabDef(fakeCtx(), { rpc, emitter: new ExplorerOpenFileEmitter() })
    expect(def.id).toBe('skills')
    expect(def.order).toBe(30)
    expect(typeof def.label).toBe('function')
    expect((def.label as () => string)()).toBe('tabLabel')
    expect(isValidElement(def.icon)).toBe(true)
  })

  it('renderPanel produces a panel element', () => {
    const def = createSkillsTabDef(fakeCtx(), { rpc, emitter: new ExplorerOpenFileEmitter() })
    const panel = def.renderPanel()
    expect(isValidElement(panel)).toBe(true)
  })
})