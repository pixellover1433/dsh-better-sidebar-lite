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
import {
  BETTER_SIDEBAR_NAMESPACE,
  registerBetterSidebarSettings,
  selfExposeBetterSidebarSettings,
} from './settings.ts'
import { SETTINGS_DEFAULTS } from '../contract/index.ts'

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
  registerBetterSidebarSettings(ctx)
  // Self-expose the settings namespace to the browser config client (so the
  // Settings > Plugins card is visible at runtime without a dsh api-proxy edit).
  selfExposeBetterSidebarSettings(ctx)
  const explorer = new ExplorerService(fsNode, {
    maxEntries: cfg.maxEntriesPerListing,
    hidePatterns: cfg.hidePatterns,
    allowedRoots: cfg.allowedRoots,
  })
  // The git timeout is user-editable via the settings namespace when the
  // settings seam is composed (Settings > Plugins), read live on every command;
  // otherwise it falls back to the cordis config value (defaults to the
  // contract default). This replaces the previous always-fixed cordis config.
  const runner = new GitRunner({
    executable: cfg.gitExecutable,
    timeoutMs: () => readGitTimeout(ctx, cfg.gitTimeoutMs),
  })
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

/**
 * Read the current git timeout from the settings namespace when available,
 * else fall back to the legacy config value. Falls back to the contract
 * default when the section is not yet resolved by the settings provider.
 */
function readGitTimeout(ctx: Context, legacyMs: number): number {
  const settings = ctx.get('settings')
  const resolved = settings?.get(BETTER_SIDEBAR_NAMESPACE) as
    | { gitTimeoutMs?: number }
    | undefined
  if (resolved?.gitTimeoutMs !== undefined) return resolved.gitTimeoutMs
  return legacyMs === undefined ? SETTINGS_DEFAULTS.gitTimeoutMs : legacyMs
}

