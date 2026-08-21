/**
 * Skills tab definition (ADR-003): registers the built-in skills tab with id
 * 'skills' and order 30. The factory binds the skills namespace translate once
 * so the label is locale-aware and the panel receives the same bound function.
 * This file stays a .ts module (tab-def source is non-JSX; panel elements are
 * built with createElement to keep the compiler happy without a .tsx file).
 */
import { createElement } from 'react';
import { SkillsIcon } from "../../icons.js";
import { SkillsTab } from "./SkillsTab.js";
import { NS } from "./locales.js";
export function createSkillsTabDef(ctx, api) {
    const t = ctx.locale.bind(NS);
    return {
        id: 'skills',
        order: 30,
        label: () => t('tabLabel'),
        icon: createElement(SkillsIcon),
        renderPanel: () => createElement(SkillsTab, { rpc: api.rpc, emitter: api.emitter, t }),
    };
}
//# sourceMappingURL=tab-def.js.map