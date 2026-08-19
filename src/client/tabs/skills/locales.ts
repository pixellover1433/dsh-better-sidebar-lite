/**
 * `betterSidebar.skills` namespace dictionaries. The zh dictionary is the
 * key-set source of truth; en is key-identical. client-core registers this
 * namespace via ctx.locale.register; the LocaleNamespaceMap merge below makes
 * the typed translate (TranslateNS<'betterSidebar.skills'>) reject typos at
 * compile time. Mirrors the git tab's locales module exactly.
 */
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Dictionary namespace owned by the skills tab. */
export const NS = 'betterSidebar.skills' as const

/** Simplified-Chinese dictionary (source of truth for the key set). */
export const zh = {
  tabLabel: '技能',
  refresh: '刷新',
  loading: '加载中…',
  errorRetry: '重试',
  errorTitle: '加载失败',
  noWorkspace: '未打开工作区',
  noWorkspaceHint: '技能标签页需要一个工作区目录。请在对话中选择或打开一个工作区。',
  emptyTitle: '没有可用技能',
  emptyHint: '当前没有可用的技能。',
  warningTitle: '技能加载异常',
  statusEnabled: '已启用',
  statusDisabled: '已禁用',
  statusModelOnly: '仅模型',
  statusUserOnly: '仅用户',
} as const

/** English dictionary, key-identical to the zh source of truth. */
export const en: Record<SkillsKey, string> = {
  tabLabel: 'Skills',
  refresh: 'Refresh',
  loading: 'Loading…',
  errorRetry: 'Retry',
  errorTitle: 'Failed to load skills',
  noWorkspace: 'No open workspace',
  noWorkspaceHint: 'The Skills tab needs a workspace directory. Open or select one in a conversation to continue.',
  emptyTitle: 'No skills',
  emptyHint: 'No skills are currently available.',
  warningTitle: 'Skill load issue',
  statusEnabled: 'Enabled',
  statusDisabled: 'Disabled',
  statusModelOnly: 'Model only',
  statusUserOnly: 'User only',
}

/** Key domain of the skills namespace. */
export type SkillsKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Skills tab copy. */
    'betterSidebar.skills': SkillsKey
  }
}