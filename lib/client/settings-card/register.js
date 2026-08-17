import { SidebarSettingsCardController } from "./controller.js";
import { BetterSidebarSettingsCard } from "./BetterSidebarSettingsCard.js";
export function registerBetterSidebarCard(ctx, services) {
    const controller = new SidebarSettingsCardController(services.scope);
    const observable = controller.observable();
    const face = {
        ...controller.actions(),
        hooks: { settingsCard: observable },
    };
    const dispose = ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
        name: 'settings.plugin.item',
        id: 'better-sidebar',
        order: 100,
        inject: () => face,
    }, BetterSidebarSettingsCard));
    return dispose;
}
//# sourceMappingURL=register.js.map