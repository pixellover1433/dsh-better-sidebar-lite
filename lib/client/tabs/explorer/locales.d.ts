/** Dictionary namespace owned by the explorer tab. */
export declare const NS: "betterSidebar.explorer";
/** Simplified-Chinese dictionary (source of truth for the key set). */
export declare const zh: {
    readonly tabLabel: "资源管理器";
    readonly noWorkspace: "未打开工作区";
    readonly noWorkspaceHint: "打开一个会话或工作区后，这里会显示文件树。";
    readonly loading: "加载中…";
    readonly retry: "重试";
    readonly refresh: "刷新";
    readonly rootDeleted: "工作区目录已不存在";
    readonly loadFailed: "加载失败";
    readonly expand: "展开";
    readonly collapse: "收起";
    readonly openFile: "打开文件";
};
/** English dictionary, key-identical to the zh source of truth. */
export declare const en: Record<ExplorerKey, string>;
/** Key domain of the explorer namespace. */
export type ExplorerKey = keyof typeof zh;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Explorer tab copy. */
        'betterSidebar.explorer': ExplorerKey;
    }
}
//# sourceMappingURL=locales.d.ts.map