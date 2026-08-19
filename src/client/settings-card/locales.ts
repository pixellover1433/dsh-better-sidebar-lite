/**
 * Locale copy for this plugin's settings card. The card renders inside the
 * Settings > Plugins > Plugin configuration section and mirrors the shipped
 * shell/agent-loop/web-search cards: it uses the same verbatim strings the
 * harness publishes for shared card chrome (save/discard/overridden/reset/...),
 * plus keys specific to this plugin's tunables. Hosted under its own namespace
 * because `settings.plugins` is owned by ui-settings-plugins.
 */

export const NS = 'betterSidebar.plugins' as const

/** Locale keys the settings card renders. */
export type BetterSidebarPluginsLocaleKey =
  | 'cardTitle' | 'cardDescription'
  | 'overridden' | 'reset' | 'readOnly' | 'expand' | 'collapse'
  | 'save' | 'saving' | 'discard' | 'unsaved' | 'saveFailed' | 'invalidNumber' | 'invalidRange'
  | 'explorerPollMs' | 'explorerPollMsHint'
  | 'explorerDebounceMs' | 'explorerDebounceMsHint'
  | 'gitPollMs' | 'gitPollMsHint'
  | 'gitDebounceMs' | 'gitDebounceMsHint'
  | 'skillsPollMs' | 'skillsPollMsHint'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** This plugin's settings-card namespace (Settings > Plugins). */
    'betterSidebar.plugins': BetterSidebarPluginsLocaleKey
  }
}

/** English copy (card-chrome strings mirror ui-settings-plugins verbatim). */
export const en: Record<BetterSidebarPluginsLocaleKey, string> = {
  cardTitle: 'Better Sidebar',
  cardDescription: 'Auto-refresh cadence for the explorer and git tabs.',
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  expand: 'Show settings',
  collapse: 'Hide settings',
  save: 'Save',
  saving: 'Saving…',
  discard: 'Discard',
  unsaved: 'Unsaved',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  invalidNumber: 'Enter a number, or leave blank to use the default.',
  invalidRange: 'Enter a number between {min} and {max}.',
  explorerPollMs: 'Explorer refresh poll (ms)',
  explorerPollMsHint: 'How often the explorer asks the host for changed directories.',
  explorerDebounceMs: 'Explorer refresh debounce (ms)',
  explorerDebounceMsHint: 'How long to wait after agent activity before refreshing the tree.',
  gitPollMs: 'Git refresh poll (ms)',
  gitPollMsHint: 'How often the git tab re-checks the working tree.',
  gitDebounceMs: 'Git refresh debounce (ms)',
  gitDebounceMsHint: 'How long to wait after agent activity before refreshing git status.',
  skillsPollMs: 'Skills refresh poll (ms)',
  skillsPollMsHint: 'How often the skills tab re-checks the catalog.',
}

/** Simplified Chinese copy. */
export const zh: Record<BetterSidebarPluginsLocaleKey, string> = {
  cardTitle: 'Better Sidebar',
  cardDescription: '资源管理器与 Git 标签页的自动刷新节奏。',
  overridden: '已覆盖',
  reset: '恢复默认',
  readOnly: '本部署的设置为只读。',
  expand: '展开设置',
  collapse: '收起设置',
  save: '保存',
  saving: '保存中…',
  discard: '放弃修改',
  unsaved: '未保存',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
  invalidNumber: '请填数字；留空表示使用默认值。',
  invalidRange: '请输入介于 {min} 与 {max} 之间的数字。',
  explorerPollMs: '资源管理器刷新轮询（毫秒）',
  explorerPollMsHint: '资源管理器多久向主机询问一次目录变化。',
  explorerDebounceMs: '资源管理器刷新防抖（毫秒）',
  explorerDebounceMsHint: 'agent 活动后等待多久再刷新目录树。',
  gitPollMs: 'Git 刷新轮询（毫秒）',
  gitPollMsHint: 'Git 标签页多久重新检查一次工作区。',
  gitDebounceMs: 'Git 刷新防抖（毫秒）',
  gitDebounceMsHint: 'agent 活动后等待多久再刷新 Git 状态。',
  skillsPollMs: '技能刷新轮询（毫秒）',
  skillsPollMsHint: 'Skills 标签页多久重新检查一次技能目录。',
}
