import { Config, resolveConfig } from "./config.js";
import { fsNode } from "./fs-node.js";
import { ExplorerService } from "./explorer.js";
import { GitRunner } from "./git-runner.js";
import { GitService } from "./git.js";
import { SkillService } from "./skills.js";
import { createChannelHandler } from "./rpc.js";
import { BETTER_SIDEBAR_NAMESPACE, registerBetterSidebarSettings, } from "./settings.js";
import { SETTINGS_DEFAULTS } from "../contract/index.js";
export { Config };
export const name = 'dsh-better-sidebar-lite';
export const inject = ['connection'];
const CHANNEL = '/better-sidebar';
/**
 * Plugin entry. Loader applies schema defaults to Config; direct embeds and
 * tests may pass a partial config and resolveConfig fills it in.
 */
export function apply(ctx, config) {
    const cfg = resolveConfig(config);
    for (const root of cfg.allowedRoots) {
        if (!fsNode.isAbsolute(root)) {
            throw new Error('better-sidebar: allowedRoots entries must be absolute paths');
        }
    }
    registerBetterSidebarSettings(ctx);
    const explorer = new ExplorerService(fsNode, {
        maxEntries: cfg.maxEntriesPerListing,
        hidePatterns: cfg.hidePatterns,
        allowedRoots: cfg.allowedRoots,
        maxReadBytes: cfg.maxReadBytes,
    });
    // The git timeout is user-editable via the settings namespace when the
    // settings seam is composed (Settings > Plugins), read live on every command;
    // otherwise it falls back to the cordis config value (defaults to the
    // contract default). This replaces the previous always-fixed cordis config.
    const runner = new GitRunner({
        executable: cfg.gitExecutable,
        timeoutMs: () => readGitTimeout(ctx, cfg.gitTimeoutMs),
    });
    const git = new GitService(runner, {
        maxLogEntries: cfg.maxLogEntries,
        maxStatusEntries: cfg.maxStatusEntries,
        untrackedFiles: cfg.untrackedFiles,
    });
    const skills = new SkillService({
        getSkills: () => ctx.get('skills'),
        getAgents: () => ctx.get('agents'),
        getSession: (sessionId) => ctx.get('sessions')?.get(sessionId),
        getAgentPresets: () => ctx.get('agentPresets'),
    });
    const handler = createChannelHandler({ explorer, git, skills });
    ctx.inject(['connection'], (connectionCtx) => {
        connectionCtx.effect(() => {
            const dispose = connectionCtx.connection.rpc.handle(CHANNEL, handler, { authority: 'loopback' });
            return () => { void dispose(); };
        }, 'better-sidebar: rpc channel');
    });
}
/**
 * Read the current git timeout from the settings namespace when available,
 * else fall back to the legacy config value. Falls back to the contract
 * default when the section is not yet resolved by the settings provider.
 */
function readGitTimeout(ctx, legacyMs) {
    const settings = ctx.get('settings');
    const resolved = settings?.get(BETTER_SIDEBAR_NAMESPACE);
    if (resolved?.gitTimeoutMs !== undefined)
        return resolved.gitTimeoutMs;
    return legacyMs === undefined ? SETTINGS_DEFAULTS.gitTimeoutMs : legacyMs;
}
//# sourceMappingURL=index.js.map