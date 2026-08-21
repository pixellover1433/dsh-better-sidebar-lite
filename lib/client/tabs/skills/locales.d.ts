/** Dictionary namespace owned by the skills tab. */
export declare const NS: "betterSidebar.skills";
/** Simplified-Chinese dictionary (source of truth for the key set). */
export declare const zh: {
    readonly tabLabel: "技能";
    readonly refresh: "刷新";
    readonly loading: "加载中…";
    readonly errorRetry: "重试";
    readonly errorTitle: "加载失败";
    readonly noWorkspace: "未打开工作区";
    readonly noWorkspaceHint: "技能标签页需要一个工作区目录。请在对话中选择或打开一个工作区。";
    readonly emptyTitle: "没有可用技能";
    readonly emptyHint: "当前没有可用的技能。";
    readonly warningTitle: "技能加载异常";
    readonly statusEnabled: "已启用";
    readonly statusDisabled: "已禁用";
    readonly statusModelOnly: "仅模型";
    readonly statusUserOnly: "仅用户";
    readonly detailBack: "返回";
    readonly detailContentTitle: "内容";
    readonly detailReferencesTitle: "引用文件";
    readonly detailNoReferences: "无引用文件";
    readonly detailNotFound: "未找到该技能";
    readonly detailProvider: "提供方";
};
/** English dictionary, key-identical to the zh source of truth. */
export declare const en: Record<SkillsKey, string>;
/** Key domain of the skills namespace. */
export type SkillsKey = keyof typeof zh;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Skills tab copy. */
        'betterSidebar.skills': SkillsKey;
    }
}
//# sourceMappingURL=locales.d.ts.map