import { SETTINGS_NAMESPACE } from "../../contract/settings.js";
import { SidebarSettingsCardController } from "./controller.js";
import { BetterSidebarSettingsCard } from "./BetterSidebarSettingsCard.js";
import { NS } from "./locales.js";
export function registerBetterSidebarCard(ctx, services) {
    const controller = new SidebarSettingsCardController(services.scope);
    const observable = controller.observable();
    const face = {
        ...controller.actions(),
        hooks: { settingsCard: observable },
    };
    // `settings.plugin.item` is a KEYED slot (dsh v0.1.0-rc.7): each card is one
    // keyed cell whose key is the settings namespace it edits. Since rc.7 the
    // Host serves every registered namespace and the Plugins configuration tab
    // dispatches a card by matching this key against `settings.describe`'s
    // served namespaces — so the key must equal the namespace id exactly
    // (`dsh-better-sidebar`), not some display label; a mismatch means the card
    // is never dispatched.
    const dispose = ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        key: SETTINGS_NAMESPACE,
        locale: NS,
        inject: () => face,
    }, BetterSidebarSettingsCard));
    return dispose;
}
export { NS };
//# sourceMappingURL=register.js.map