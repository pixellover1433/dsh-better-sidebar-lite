import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import { type BetterSidebarSettings } from '../../../contract/settings.ts';
/**
 * Resolved settings with the contract defaults filled in for fields the served
 * section does not carry (e.g. before the first accepted snapshot, or when the
 * namespace is unavailable). Never throws; treats any missing field as default.
 */
export declare function resolveSettings(snapshot: {
    value?: Partial<BetterSidebarSettings> | undefined;
}): BetterSidebarSettings;
/**
 * Read the current settings values reactively from a bound scope.
 * @param scope - the plugin's bound settings scope; undefined renders defaults.
 * @returns the resolved settings (a stable reference until a value changes).
 */
export declare function useBetterSidebarSettings(scope: SettingsScope<BetterSidebarSettings> | undefined): BetterSidebarSettings;
//# sourceMappingURL=settings.d.ts.map