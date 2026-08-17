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
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { BetterSidebarSettings } from '../../contract/settings.ts'
import { SidebarSettingsCardController } from './controller.ts'
import { BetterSidebarSettingsCard } from './BetterSidebarSettingsCard.tsx'
import { NS } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * Mirror of ui-settings-plugins' `settings.plugin.item` declaration (that
     * package is not a runtime dependency here): one plugin card inside the
     * Settings > Plugins > Plugin configuration section.
     */
    'settings.plugin.item': { kind: 'list'; scope: 'root'; owner: { children?: never } }
  }
}

export function registerBetterSidebarCard(
  ctx: ClientContext,
  services: { scope: SettingsScope<BetterSidebarSettings> },
): () => void {
  const controller = new SidebarSettingsCardController(services.scope)
  const observable = controller.observable()

  const face = {
    ...controller.actions(),
    hooks: { settingsCard: observable },
  }

  const dispose = ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: 'better-sidebar',
    order: 100,
    locale: NS,
    inject: () => face,
  }, BetterSidebarSettingsCard))
  return dispose
}

export { NS }
export type { SidebarCardActions, SidebarCardState } from './controller.ts'
