/**
 * Skill detail view: double-clicking a skill row opens its SKILL.md body plus
 * the sibling files its resource directory can reference (skills/detail).
 * Replaces the catalog list while open; the SkillsTab clears `selected` to go
 * back. Fetch state (loading / domain error / loaded-not-found / loaded) is
 * owned here and re-fetched via the same AbortController-supersede pattern the
 * catalog uses, so a superseded or unmounted request never touches state.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Endpoints } from '../../../contract/rpc.ts'
import type { SkillDetailResult, SkillDetailRequest } from '../../../contract/skills.ts'
import type { BetterSidebarRpc } from '../../rpc-client.ts'
import type { ExplorerOpenFileEmitter } from '../explorer/events.ts'
import { FileIcon } from '../../icons.tsx'
import { skillStatus, STATUS_KEY } from './SkillsTab.tsx'
import type { SkillsKey } from './locales.ts'
import styles from './skills.module.css'

export interface SkillDetailViewProps {
  rpc: BetterSidebarRpc
  /** Open-file emitter; reference rows emit into it so the shared modal opens files. */
  emitter: ExplorerOpenFileEmitter
  /** Bound skills-namespace translate. */
  t: (key: SkillsKey, params?: Record<string, unknown>) => string
  /** Kebab-case skill name whose detail to load. */
  skillName: string
  /** Absolute workspace root (the cwd-sensitivity of skill lookup). */
  root: string
  /** Active session id; omitted when none resolves (host reads host-global). */
  sessionId: string | undefined
  /** Clear the parent's selection to return to the catalog. */
  onBack: () => void
}

/** Fetch state: loading, a surfaced domain error, or a loaded detail result. */
type DetailState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; value: SkillDetailResult }

export function SkillDetailView({ rpc, emitter, t, skillName, root, sessionId, onBack }: SkillDetailViewProps) {
  const [state, setState] = useState<DetailState>({ kind: 'loading' })
  const controllerRef = useRef<AbortController | null>(null)

  /** Fetch the skill detail, superseding any in-flight or stale request. */
  const reload = useCallback(() => {
    controllerRef.current?.abort()
    const ctrl = new AbortController()
    controllerRef.current = ctrl
    setState({ kind: 'loading' })
    void (async () => {
      // Omit an undefined sessionId (exactOptionalPropertyTypes) so the host
      // falls back to the host-global scope.
      const payload: SkillDetailRequest = { name: skillName, cwd: root, ...(sessionId === undefined ? {} : { sessionId }) }
      const res = await rpc.call(Endpoints.skillsDetail, payload, { signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      if (res.ok) setState({ kind: 'loaded', value: res.value })
      else {
        // The host surfaced a domain error (value-slot SidebarResult), which is
        // now rare — only a malformed request reaches this branch. Log it so a
        // broken detail is diagnosable from the browser console.
        console.error('better-sidebar: skills/detail failed', JSON.stringify(res))
        setState({ kind: 'error', message: res.error?.message ?? '' })
      }
    })()
  }, [rpc, skillName, root, sessionId])

  // Fetch on mount / when the skill, workspace, or session changes; abort a
  // still-in-flight request on unmount.
  useEffect(() => {
    reload()
    return () => controllerRef.current?.abort()
  }, [reload])

  const loaded = state.kind === 'loaded' ? state.value : undefined
  const status = loaded?.found === true
    ? skillStatus({ name: loaded.name, description: loaded.description, invocation: loaded.invocation, source: loaded.source, provider: loaded.provider })
    : undefined
  const statusLabel = status === undefined ? undefined : t(STATUS_KEY[status])

  return (
    <div className={styles.detail}>
      <div className={styles.detailHeader}>
        <button type="button" className={styles.detailBackButton} aria-label={t('detailBack')} onClick={onBack}>
          {'\u2190 '}{t('detailBack')}
        </button>
        <span className={styles.detailName}>{skillName}</span>
      </div>

      {state.kind === 'loading' && <div className={styles.loading}>{t('loading')}</div>}

      {state.kind === 'error' && (
        <div className={styles.state}>
          <div className={styles.stateTitle}>{t('errorTitle')}</div>
          <div className={styles.stateHint}>{state.message}</div>
          <button type="button" className={styles.stateAction} onClick={reload}>
            {t('errorRetry')}
          </button>
        </div>
      )}

      {state.kind === 'loaded' && !state.value.found && (
        <div className={styles.state}>
          <div className={styles.stateTitle}>{t('detailNotFound')}</div>
          {state.value.warning !== undefined && <div className={styles.stateHint}>{state.value.warning}</div>}
          <button type="button" className={styles.stateAction} onClick={onBack}>
            {t('detailBack')}
          </button>
        </div>
      )}

      {loaded?.found === true && (
        <div className={styles.detailBody}>
          <div className={styles.detailDesc}>{loaded.description}</div>
          {loaded.whenToUse !== undefined && (
            <div className={styles.detailWhenToUse}>{loaded.whenToUse}</div>
          )}
          <div className={styles.detailMeta}>
            <span className={styles.detailLabel}>{t('detailProvider')}</span>
            <span>{loaded.provider}</span>
            {status !== undefined && statusLabel !== undefined && (
              <span className={`${styles.statusBadge} ${styles[status]}`} aria-label={statusLabel}>
                {statusLabel}
              </span>
            )}
          </div>
          {loaded.path !== undefined && (
            <div className={styles.detailPath} title={loaded.path}>{loaded.path}</div>
          )}
          {loaded.resourceDir !== undefined && (
            <div className={styles.detailPath} title={loaded.resourceDir}>{loaded.resourceDir}</div>
          )}

          <div className={styles.detailSectionTitle}>{t('detailContentTitle')}</div>
          <pre className={styles.detailContent}>{loaded.content}</pre>

          <div className={styles.detailSectionTitle}>{t('detailReferencesTitle')}</div>
          {loaded.references.length === 0
            ? <div className={styles.detailNoRefs}>{t('detailNoReferences')}</div>
            : (
              <ul className={styles.detailReferences}>
                {loaded.references.map(ref => (
                  <li
                    key={ref.path}
                    className={styles.referenceItem}
                    title={ref.path}
                    onDoubleClick={() => emitter.emit({
                      path: ref.path,
                      name: ref.name,
                      kind: 'file',
                      source: 'double-click',
                      rootPath: loaded.resourceDir ?? root,
                    })}
                  >
                    <span className={styles.referenceIcon}>
                      <FileIcon size={13} />
                    </span>
                    <span className={styles.referenceName}>{ref.name}</span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}
    </div>
  )
}