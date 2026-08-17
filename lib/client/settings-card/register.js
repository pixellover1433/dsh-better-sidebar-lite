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
    // `settings.plugin.item` is a KEYED slot: each card is one keyed cell, so the
    // registration carries `key` (not `id`) — a missing key throws at load, which
    // is exactly the failure a fresh install would see if it regressed.
    const dispose = ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        key: 'better-sidebar',
        locale: NS,
        inject: () => face,
    }, BetterSidebarSettingsCard));
    return dispose;
}
export { NS };
//# sourceMappingURL=register.js.map