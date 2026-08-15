/**
 * Git tab definition (ADR-003/004): registers the built-in git tab with id
 * 'git' and order 20. The factory binds the git namespace translate once so the
 * label is locale-aware and the panel receives the same bound function. This
 * file stays a .ts module (tab-def source is non-JSX; panel elements are built
 * with createElement to keep the compiler happy without a .tsx file).
 */
import { createElement } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { BetterSidebarRpc } from '../../rpc-client.ts'
import type { TabDef } from '../../tab-registry/contract.ts'
import { GitBranchIcon } from '../../icons.tsx'
import { GitTab } from './git-tab.tsx'
import { NS } from './locales.ts'

export interface CreateGitTabDefApi {
  rpc: BetterSidebarRpc
}

export function createGitTabDef(ctx: ClientContext, api: CreateGitTabDefApi): TabDef {
  const t = ctx.locale.bind(NS)
  return {
    id: 'git',
    order: 20,
    label: () => t('tabLabel'),
    icon: createElement(GitBranchIcon),
    renderPanel: () => createElement(GitTab, { rpc: api.rpc, t }),
  }
}
