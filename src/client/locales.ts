/**
 * 'betterSidebar.dock' locale dictionaries (ADR-003, D7 §8). zh is the
 * key-set source of truth; en is key-identical. Shell/aria copy for the dock
 * chrome; tab labels stay in each tab's own namespace.
 */
export const NS = 'betterSidebar.dock'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Right-docked sidebar shell copy. */
    'betterSidebar.dock': DockKey
  }
}

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
} as const

/** Key domain of the dock namespace. */
export type DockKey = keyof typeof zh

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<DockKey, string> = {
  'dock.title': 'Right sidebar',
  'toggle.collapse': 'Collapse sidebar',
  'toggle.expand': 'Expand sidebar',
  'toggle.sidebar': 'Toggle sidebar',
  'resize.label': 'Resize',
  'tablist.label': 'Panels',
  'refresh': 'Refresh',
  'empty.title': 'No panels',
  'loading': 'Loading…',
}