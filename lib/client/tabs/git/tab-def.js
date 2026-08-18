/**
 * Git tab definition (ADR-003/004): registers the built-in git tab with id
 * 'git' and order 20. The factory binds the git namespace translate once so the
 * label is locale-aware and the panel receives the same bound function. This
 * file stays a .ts module (tab-def source is non-JSX; panel elements are built
 * with createElement to keep the compiler happy without a .tsx file).
 */
import { createElement } from 'react';
import { GitBranchIcon } from "../../icons.js";
import { GitTab } from "./git-tab.js";
import { NS } from "./locales.js";
export function createGitTabDef(ctx, api) {
    const t = ctx.locale.bind(NS);
    return {
        id: 'git',
        order: 20,
        label: () => t('tabLabel'),
        icon: createElement(GitBranchIcon),
        renderPanel: () => createElement(GitTab, { rpc: api.rpc, emitter: api.emitter, t }),
    };
}
//# sourceMappingURL=tab-def.js.map