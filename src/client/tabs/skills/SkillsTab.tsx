/**
 * Skills tab panel: shows the FULL harness skill catalog by reading the host
 * skill-registry service (ctx.skills) over the skills/list endpoint. The fetch
 * is cwd-scoped (skill lookup is cwd-sensitive, so the active workspace root is
 * sent), and the host merges the reachable harness scopes (global layer + the
 * active agent's layer chain when a session id is present). list() already
 * returns every skill with its invocation status (enabled/disabled/model-only/
 * user-only), so the tab renders the full catalog — it does not filter by
 * invocability. Display-only — each row shows the skill's name, description,
 * and its model/user invocation status derived from the resolved invocation
 * policy. Simpler than the git tab: no auto-refresh polling — a manual refresh
 * and one fetch on mount (or when the active session or workspace changes).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Endpoints } from '../../../contract/rpc.ts'
import type { SkillEntry, SkillListRequest } from '../../../contract/skills.ts'
import type { BetterSidebarRpc } from '../../rpc-client.ts'
import { useDock } from '../../dock/context.ts'
import { resolveRoot } from '../../workspace-root.ts'
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

/** Fetch state: loading, a surfaced error, the loaded catalog, or no workspace. */
type SkillsState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; skills: SkillEntry[] }
  | { kind: 'noWorkspace' }

export function SkillsTab({ rpc, t }: SkillsTabProps) {
  const { useSessions, useWorkspaces } = useDock()
  const sessions = useSessions(s => s)
  const workspaces = useWorkspaces(w => w)
  const root = resolveRoot(sessions, workspaces)
  const sessionId = sessions.current

  const [state, setState] = useState<SkillsState>({ kind: 'loading' })
  const controllerRef = useRef<AbortController | null>(null)

  /** Fetch the catalog, superseding any in-flight request. */
  const refresh = useCallback(() => {
    if (root === undefined) {
      setState({ kind: 'noWorkspace' })
      return
    }
    controllerRef.current?.abort()
    const ctrl = new AbortController()
    controllerRef.current = ctrl
    setState({ kind: 'loading' })
    void (async () => {
      // SessionId may be undefined when no active session resolves; omit it
      // rather than send an explicit undefined, which exactOptionalPropertyTypes
      // forbids on the contract. cwd is always sent — skill lookup is cwd-sensitive.
      const payload: SkillListRequest = { cwd: root, ...(sessionId === undefined ? {} : { sessionId }) }
      const res = await rpc.call(Endpoints.skillsList, payload, { signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      if (res.ok) setState({ kind: 'loaded', skills: res.value.skills })
      else setState({ kind: 'error', message: res.error.message })
    })()
  }, [rpc, root, sessionId])

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
        {state.kind === 'noWorkspace' && (
          <div className={styles.state}>
            <div className={styles.stateTitle}>{t('noWorkspace')}</div>
            <div className={styles.stateHint}>{t('noWorkspaceHint')}</div>
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