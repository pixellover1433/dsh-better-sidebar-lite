/**
 * Explorer tab factory (ADR-003/004). Brings the explorer tab into the tab
 * registry. The rpc face and open-file emitter are injected as explicit props
 * (preferring explicit props over useDock inside the panel — see ExplorerPanel)
 * so the panel stays renderable anywhere; the panel reads session/workspace
 * hooks from DockContext. Uses createElement instead of JSX so the factory
 * stays a plain .ts module.
 */
import { createElement } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { BetterSidebarRpc } from '../../rpc-client.ts'
import type { TabDef } from '../../tab-registry/contract.ts'
import { FolderIcon } from '../../icons.tsx'
import type { ExplorerOpenFileEmitter } from './events.ts'
import { ExplorerPanel } from './ExplorerPanel.tsx'
import { NS } from './locales.ts'

export function createExplorerTabDef(
  ctx: ClientContext,
  api: { rpc: BetterSidebarRpc; emitter: ExplorerOpenFileEmitter },
): TabDef {
  // Locale-aware label bound to the active locale at call time.
  const t = ctx.locale.bind(NS)
  return {
    id: 'explorer',
    order: 10,
    label: () => t('tabLabel'),
    icon: createElement(FolderIcon),
    renderPanel: () => createElement(ExplorerPanel, { rpc: api.rpc, emitter: api.emitter, t }),
  }
}