import type { ReactNode } from 'react';
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots';
import type { SidebarCardActions, SidebarCardState } from './controller.ts';
import type { BetterSidebarPluginsLocaleKey } from './locales.ts';
/** The registration-side inject face: card actions + a bound settings store. */
export interface BetterSidebarSettingsCardFace extends SidebarCardActions {
    hooks: {
        /** Card snapshot; bound by the renderer as the `useSettingsCard` hook. */
        settingsCard: {
            getSnapshot(): SidebarCardState;
            subscribe(fn: () => void): () => void;
        };
    };
}
/** What the renderer binds: actions pass through, the store hook is bound. */
export type BetterSidebarSettingsCardProps = SidebarCardActions & {
    /** Card snapshot selector hook (bound from the inject face). */
    useSettingsCard: SnapshotSelectorHook<SidebarCardState>;
    /** Locale reader for this namespace. */
    t: (key: BetterSidebarPluginsLocaleKey) => string;
};
export declare function BetterSidebarSettingsCard(props: BetterSidebarSettingsCardProps): ReactNode;
//# sourceMappingURL=BetterSidebarSettingsCard.d.ts.map