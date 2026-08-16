/** Dictionary namespace owned by the git tab. */
export declare const NS: "betterSidebar.git";
/** Simplified-Chinese dictionary (source of truth for the key set). */
export declare const zh: {
    readonly tabLabel: "Git";
    readonly refresh: "刷新";
    readonly staged: "已暂存";
    readonly conflicts: "冲突";
    readonly changes: "更改";
    readonly untracked: "未跟踪";
    readonly stage: "暂存";
    readonly unstage: "取消暂存";
    readonly stageAll: "全部暂存";
    readonly unstageAll: "全部取消暂存";
    readonly loadMore: "加载更多";
    readonly notARepo: "这不是 Git 仓库";
    readonly notARepoHint: "当前工作区不是 Git 仓库。可以使用其他路径或重新尝试。";
    readonly gitMissing: "未找到 Git";
    readonly gitMissingHint: "未检测到 Git 可执行文件。请确认已安装 Git 后重试。";
    readonly errorRetry: "重试";
    readonly branch: "分支";
    readonly emptyStatus: "没有更改，工作区是干净的";
    readonly emptyLog: "还没有提交";
    readonly emptyCommitFiles: "该提交没有文件变更";
    readonly commitDetailTitle: "查看提交详情";
    readonly back: "返回";
    readonly commit: "提交";
    readonly commitMessage: "提交信息";
    readonly commitPlaceholder: "输入提交信息…";
    readonly commitAll: "包含所有更改（自动暂存）";
    readonly commitStagedHint: "无已暂存更改";
    readonly discard: "丢弃";
    readonly discardConfirm: "确定要丢弃文件 “{path}” 的所有更改吗？此操作不可撤销。";
    readonly discardAll: "全部丢弃";
    readonly discardAllConfirm: "确定要丢弃所有未暂存的更改和未跟踪的文件吗？此操作不可撤销。";
    readonly loading: "加载中…";
    readonly noWorkspace: "未打开工作区";
    readonly noWorkspaceHint: "Git 标签页需要一个工作区目录。请打开或选择一个工作区。";
};
/** English dictionary, key-identical to the zh source of truth. */
export declare const en: Record<GitKey, string>;
/** Key domain of the git namespace. */
export type GitKey = keyof typeof zh;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Git tab copy. */
        'betterSidebar.git': GitKey;
    }
}
//# sourceMappingURL=locales.d.ts.map