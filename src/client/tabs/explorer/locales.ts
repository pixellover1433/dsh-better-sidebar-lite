/**
 * `betterSidebar.explorer` namespace dictionaries. The zh dictionary is the
 * key-set source of truth; en is key-identical. client-core registers this
 * namespace via ctx.locale.register; the LocaleNamespaceMap merge below makes
 * the typed translate (TranslateNS<'betterSidebar.explorer'>) reject typos at
 * compile time. Mirrors the git tab's locales module exactly.
 */
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Dictionary namespace owned by the explorer tab. */
export const NS = 'betterSidebar.explorer' as const

/** Simplified-Chinese dictionary (source of truth for the key set). */
export const zh = {
  tabLabel: '资源管理器',
  noWorkspace: '未打开工作区',
  noWorkspaceHint: '打开一个会话或工作区后，这里会显示文件树。',
  loading: '加载中…',
  retry: '重试',
  refresh: '刷新',
  rootDeleted: '工作区目录已不存在',
  loadFailed: '加载失败',
  expand: '展开',
  collapse: '收起',
  openFile: '打开文件',
} as const

/** English dictionary, key-identical to the zh source of truth. */
export const en: Record<ExplorerKey, string> = {
  tabLabel: 'Explorer',
  noWorkspace: 'No workspace open',
  noWorkspaceHint: 'Open a session or workspace to see its file tree here.',
  loading: 'Loading…',
  retry: 'Retry',
  refresh: 'Refresh',
  rootDeleted: 'The workspace directory no longer exists',
  loadFailed: 'Failed to load',
  expand: 'Expand',
  collapse: 'Collapse',
  openFile: 'Open file',
} as const

/** Key domain of the explorer namespace. */
export type ExplorerKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Explorer tab copy. */
    'betterSidebar.explorer': ExplorerKey
  }
}