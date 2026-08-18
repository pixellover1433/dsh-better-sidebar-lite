/**
 * 'betterSidebar.dock' locale dictionaries (ADR-003, D7 §8). zh is the
 * key-set source of truth; en is key-identical. Shell/aria copy for the dock
 * chrome; tab labels stay in each tab's own namespace.
 */
export const NS = 'betterSidebar.dock';
/** Simplified Chinese dictionary (key-set source of truth). */
export const zh = {
    'dock.title': '右侧面板',
    'toggle.collapse': '收起侧边栏',
    'toggle.expand': '展开侧边栏',
    'toggle.sidebar': '切换侧边栏',
    'resize.label': '调整宽度',
    'tablist.label': '面板',
    'refresh': '刷新',
    'empty.title': '暂无面板',
    'loading': '加载中…',
    'editor.title': '查看文件',
    'editor.loading': '加载文件内容…',
    'editor.close': '关闭',
    'editor.truncated': '（文件较大，内容已截断）',
    'editor.noChanges': '（无变更）',
    'editor.resize': '调整宽度',
    'editor.resizeCorner': '调整大小',
};
/** English dictionary, key-identical to the Chinese source of truth. */
export const en = {
    'dock.title': 'Right sidebar',
    'toggle.collapse': 'Collapse sidebar',
    'toggle.expand': 'Expand sidebar',
    'toggle.sidebar': 'Toggle sidebar',
    'resize.label': 'Resize',
    'tablist.label': 'Panels',
    'refresh': 'Refresh',
    'empty.title': 'No panels',
    'loading': 'Loading…',
    'editor.title': 'View file',
    'editor.loading': 'Loading file contents…',
    'editor.close': 'Close',
    'editor.truncated': ' (file is large, contents truncated)',
    'editor.noChanges': ' (no changes)',
    'editor.resize': 'Resize width',
    'editor.resizeCorner': 'Resize',
};
//# sourceMappingURL=locales.js.map