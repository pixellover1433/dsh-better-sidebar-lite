/**
 * 'betterSidebar.dock' locale dictionaries (ADR-003, D7 §8). zh is the
 * key-set source of truth; en is key-identical. Shell/aria copy for the dock
 * chrome; tab labels stay in each tab's own namespace.
 */
export declare const NS = "betterSidebar.dock";
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Right-docked sidebar shell copy. */
        'betterSidebar.dock': DockKey;
    }
}
/** Simplified Chinese dictionary (key-set source of truth). */
export declare const zh: {
    readonly 'dock.title': "右侧面板";
    readonly 'toggle.collapse': "收起侧边栏";
    readonly 'toggle.expand': "展开侧边栏";
    readonly 'toggle.sidebar': "切换侧边栏";
    readonly 'resize.label': "调整宽度";
    readonly 'tablist.label': "面板";
    readonly refresh: "刷新";
    readonly 'empty.title': "暂无面板";
    readonly loading: "加载中…";
    readonly 'editor.title': "查看文件";
    readonly 'editor.loading': "加载文件内容…";
    readonly 'editor.close': "关闭";
    readonly 'editor.truncated': "（文件较大，内容已截断）";
    readonly 'editor.noChanges': "（无变更）";
    readonly 'editor.resize': "调整宽度";
    readonly 'editor.resizeCorner': "调整大小";
};
/** Key domain of the dock namespace. */
export type DockKey = keyof typeof zh;
/** English dictionary, key-identical to the Chinese source of truth. */
export declare const en: Record<DockKey, string>;
//# sourceMappingURL=locales.d.ts.map