/**
 * Explorer tab factory (ADR-003/004). Brings the explorer tab into the tab
 * registry. The rpc face and open-file emitter are injected as explicit props
 * (preferring explicit props over useDock inside the panel — see ExplorerPanel)
 * so the panel stays renderable anywhere; the panel reads session/workspace
 * hooks from DockContext. Uses createElement instead of JSX so the factory
 * stays a plain .ts module.
 */
import { createElement } from 'react';
import { FolderIcon } from "../../icons.js";
import { ExplorerPanel } from "./ExplorerPanel.js";
import { NS } from "./locales.js";
export function createExplorerTabDef(ctx, api) {
    // Locale-aware label bound to the active locale at call time.
    const t = ctx.locale.bind(NS);
    return {
        id: 'explorer',
        order: 10,
        label: () => t('tabLabel'),
        icon: createElement(FolderIcon),
        renderPanel: () => createElement(ExplorerPanel, { rpc: api.rpc, emitter: api.emitter, t }),
    };
}
//# sourceMappingURL=tab-def.js.map