/**
 * Skills tab panel: lists the harness's available agent "skills" by reading
 * the host skill-registry service (ctx.skills) over the skills/list endpoint.
 * Display-only — each row shows the skill's name, description, and its
 * model/user invocation status derived from the resolved invocation policy.
 * Simpler than the git tab: no workspace/session dependency, no auto-refresh
 * polling — a manual refresh and one fetch on mount.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Endpoints } from '../../../contract/rpc.ts'
import type { SkillEntry } from '../../../contract/skills.ts'
import type { BetterSidebarRpc } from '../../rpc-client.ts'
import { RefreshIcon, SkillsIcon } from '../../icons.tsx'
import type { SkillsKey } from './locales.ts'
import styles from './skills.module.css'

export interface SkillsTabProps {
  rpc: BetterSidebarRpc
  /** Bound skills-namespace translate. */
  t: (key: SkillsKey, params?: Record<string, unknown>) => string
}

/** Derived model/user invocation status of one skill. */
export type SkillsStatus = 'enabled' | 'disabled' | 'modelOnly' | 'userOnly'

export function skillStatus(entry: SkillEntry): SkillsStatus {
  const { modelInvocable, userInvocable } = entry.invocation
  if (modelInvocable && userInvocable) return 'enabled'
  if (!modelInvocable && !userInvocable) return 'disabled'
  return modelInvocable ? 'modelOnly' : 'userOnly'
}

/** Localized key per status, and the CSS class riding alongside. */
const STATUS_KEY: Record<SkillsStatus, SkillsKey> = {
  enabled: 'statusEnabled',
  disabled: 'statusDisabled',
  modelOnly: 'statusModelOnly',
  userOnly: 'statusUserOnly',
}

/** Fetch state: loading, a surfaced error, or the loaded catalog. */
type SkillsState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; skills: SkillEntry[] }

export function SkillsTab({ rpc, t }: SkillsTabProps) {
  const [state, setState] = useState<SkillsState>({ kind: 'loading' })
  const controllerRef = useRef<AbortController | null>(null)

  /** Fetch the catalog, superseding any in-flight request. */
  const refresh = useCallback(() => {
    controllerRef.current?.abort()
    const ctrl = new AbortController()
    controllerRef.current = ctrl
    setState({ kind: 'loading' })
    void (async () => {
      const res = await rpc.call(Endpoints.skillsList, {}, { signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      if (res.ok) setState({ kind: 'loaded', skills: res.value.skills })
      else setState({ kind: 'error', message: res.error.message })
    })()
  }, [rpc])

  // Fetch on mount; abort a still-in-flight request on unmount.
  useEffect(() => {
    refresh()
    return () => controllerRef.current?.abort()
  }, [refresh])

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>
          <SkillsIcon size={14} />
          <span>{t('tabLabel')}</span>
        </span>
        <button type="button" className={styles.iconButton} aria-label={t('refresh')} onClick={refresh}>
          <RefreshIcon size={14} />
        </button>
      </div>
      <div className={styles.body}>
        {state.kind === 'loading' && <div className={styles.loading}>{t('loading')}</div>}
        {state.kind === 'error' && (
          <div className={styles.state}>
            <div className={styles.stateTitle}>{t('errorTitle')}</div>
            <div className={styles.stateHint}>{state.message}</div>
            <button type="button" className={styles.stateAction} onClick={refresh}>
              {t('errorRetry')}
            </button>
          </div>
        )}
        {state.kind === 'loaded' && state.skills.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.stateTitle}>{t('emptyTitle')}</div>
            <div className={styles.stateHint}>{t('emptyHint')}</div>
          </div>
        )}
        {state.kind === 'loaded' && state.skills.length > 0 && (
          <ul className={styles.list}>
            {state.skills.map(skill => {
              const status = skillStatus(skill)
              const statusLabel = t(STATUS_KEY[status])
              return (
                <li key={skill.name} className={styles.row}>
                  <span className={styles.skillName}>{skill.name}</span>
                  <span className={styles.skillDesc}>{skill.description}</span>
                  <span className={`${styles.statusBadge} ${styles[status]}`} aria-label={statusLabel}>
                    {statusLabel}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}