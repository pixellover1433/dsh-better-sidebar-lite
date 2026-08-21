/**
 * Skills tab definition (ADR-003): registers the built-in skills tab with id
 * 'skills' and order 30. The factory binds the skills namespace translate once
 * so the label is locale-aware and the panel receives the same bound function.
 * This file stays a .ts module (tab-def source is non-JSX; panel elements are
 * built with createElement to keep the compiler happy without a .tsx file).
 */
import { createElement } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { BetterSidebarRpc } from '../../rpc-client.ts'
import type { TabDef } from '../../tab-registry/contract.ts'
import type { ExplorerOpenFileEmitter } from '../explorer/events.ts'
import { SkillsIcon } from '../../icons.tsx'
import { SkillsTab } from './SkillsTab.tsx'
import { NS } from './locales.ts'

export interface CreateSkillsTabDefApi {
  rpc: BetterSidebarRpc
  /** Open-file emitter; reference rows emit into it so the shared modal opens files. */
  emitter: ExplorerOpenFileEmitter
}

export function createSkillsTabDef(ctx: ClientContext, api: CreateSkillsTabDefApi): TabDef {
  const t = ctx.locale.bind(NS)
  return {
    id: 'skills',
    order: 30,
    label: () => t('tabLabel'),
    icon: createElement(SkillsIcon),
    renderPanel: () => createElement(SkillsTab, { rpc: api.rpc, emitter: api.emitter, t }),
  }
}