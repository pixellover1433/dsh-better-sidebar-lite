/**
 * Host plugin entry (D6 §6). Resolves config, validates allowedRoots are
 * absolute, constructs the services, and registers the /better-sidebar RPC
 * channel on the injected connection, wrapped in a ctx.effect disposer.
 */
import type { Context } from '@deepseek-ai/cordis';
import { Config, type BetterSidebarConfig } from './config.ts';
export type { BetterSidebarConfig } from './config.ts';
export { Config };
export declare const name = "dsh-better-sidebar-lite";
export declare const inject: string[];
/**
 * Plugin entry. Loader applies schema defaults to Config; direct embeds and
 * tests may pass a partial config and resolveConfig fills it in.
 */
export declare function apply(ctx: Context, config?: BetterSidebarConfig): void;
//# sourceMappingURL=index.d.ts.map