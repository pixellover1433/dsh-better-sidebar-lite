/**
 * Plugin configuration card registration (ADR-004 §3 amendment). Contributes a
 * card to the shared `settings.plugin.item` slot of the Settings > Plugins >
 * Plugin configuration section. The card edits the same settings namespace the
 * dock reads, so a saved value is picked up by the tabs immediately.
 *
 * The inject face mirrors the harness's card contract: `hooks.settingsCard` is
 * a bare observable the renderer binds as the `useSettingsCard` selector hook,
 * and the card actions pass through as props. Registration is guarded in the
 * client plugin entry — it runs only when the settings seam is composed. The
 * `settings.plugin.item` slot type is mirrored here (the declaring package is
 * not a runtime dependency of this workspace), matching the repo's local-mirror
 * convention for ui-sidebar's `sidebar.footer.action`.
 */
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import { type BetterSidebarSettings } from '../../contract/settings.ts';
import { NS } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        /**
         * Mirror of ui-settings-plugins' `settings.plugin.item` declaration (that
         * package is not a runtime dependency here). Deployed dsh declares this slot
         * KEYED (each configurable plugin card is one keyed cell); register with
         * `key`, not `id`.
         */
        'settings.plugin.item': {
            kind: 'keyed';
            scope: 'root';
            owner: {
                children?: never;
            };
        };
    }
}
export declare function registerBetterSidebarCard(ctx: ClientContext, services: {
    scope: SettingsScope<BetterSidebarSettings>;
}): () => void;
export { NS };
export type { SidebarCardActions, SidebarCardState } from './controller.ts';
//# sourceMappingURL=register.d.ts.map