/**
 * Host plugin entry (D6 §6). Resolves config, validates allowedRoots are
 * absolute, constructs the services, and registers the /better-sidebar RPC
 * channel on the injected connection, wrapped in a ctx.effect disposer.
 */
import type { Context } from '@deepseek-ai/cordis'
import { Config, resolveConfig, type BetterSidebarConfig } from './config.ts'
import { fsNode } from './fs-node.ts'
import { ExplorerService } from './explorer.ts'
import { GitRunner } from './git-runner.ts'
import { GitService } from './git.ts'
import { createChannelHandler } from './rpc.ts'

export type { BetterSidebarConfig } from './config.ts'
export { Config }

export const name = 'dsh-better-sidebar-lite'

export const inject = ['connection']

const CHANNEL = '/better-sidebar'

/**
 * Plugin entry. Loader applies schema defaults to Config; direct embeds and
 * tests may pass a partial config and resolveConfig fills it in.
 */
export function apply(ctx: Context, config?: BetterSidebarConfig): void {
  const cfg = resolveConfig(config)
  for (const root of cfg.allowedRoots) {
    if (!fsNode.isAbsolute(root)) {
      throw new Error('better-sidebar: allowedRoots entries must be absolute paths')
    }
  }
  const explorer = new ExplorerService(fsNode, {
    maxEntries: cfg.maxEntriesPerListing,
    hidePatterns: cfg.hidePatterns,
    allowedRoots: cfg.allowedRoots,
  })
  const runner = new GitRunner({ executable: cfg.gitExecutable, timeoutMs: cfg.gitTimeoutMs })
  const git = new GitService(runner, {
    maxLogEntries: cfg.maxLogEntries,
    maxStatusEntries: cfg.maxStatusEntries,
    untrackedFiles: cfg.untrackedFiles,
  })
  const handler = createChannelHandler({ explorer, git })

  ctx.inject(['connection'], (connectionCtx) => {
    connectionCtx.effect(() => {
      const dispose = connectionCtx.connection.rpc.handle(CHANNEL, handler, { authority: 'loopback' })
      return () => { void dispose() }
    }, 'better-sidebar: rpc channel')
  })
}
