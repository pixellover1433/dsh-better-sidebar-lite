/**
 * FileModalEditor (ADR-004): the single consumer of open-file events. It
 * subscribes once to the shared open-file emitter at the dock root and renders
 * a modal over the ENTIRE sidebar (any tab) whenever a file is opened — from
 * the explorer double-click/Enter or a git status-row double-click. Content is
 * fetched through the /better-sidebar RPC channel; the dock shell has no
 * filesystem access, so every read goes to the host.
 *
 * Mounted inside DockContext.Provider but outside the TabPanel branch in
 * DockRoot, so it overlays regardless of which tab is active and still works
 * when the dock is collapsed (the provider always renders).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { Endpoints } from '../../contract/rpc.ts'
import type { BetterSidebarRpc } from '../rpc-client.ts'
import type { ExplorerEvents, ExplorerOpenFileEvent } from '../tabs/explorer/events.ts'
import { CloseIcon } from '../icons.tsx'
import styles from './FileModalEditor.module.css'

export interface FileModalEditorProps {
  /** Typed RPC facade (the only way the client talks to the host). */
  rpc: BetterSidebarRpc
  /** The shared open-file event source (explorer and git both emit into it). */
  events: ExplorerEvents
  /** Bound dock-namespace translate (locale-aware copy). */
  t: TranslateNS<'betterSidebar.dock'>
}

/** What the editor is showing right now, with its fetch phase. */
interface OpenFileState {
  /** Identifies the requested file so a stale response can be ignored. */
  path: string
  name: string
  rootPath: string
  phase: 'loading' | 'error' | 'loaded'
  /** Present when phase === 'loaded'. */
  content?: string
  /** Present when phase === 'loaded'; true when the host cut the content at its cap. */
  truncated?: boolean
  /** Present when phase === 'error'. */
  errorMessage?: string
}

/**
 * The sidebar-wide file modal. Subscribes to open-file events once per mount
 * and supersedes an in-flight read when a newer open arrives, so rapid
 * double-clicks always settle on the last-opened file.
 */
export function FileModalEditor({ rpc, events, t }: FileModalEditorProps): JSX.Element | null {
  const [file, setFile] = useState<OpenFileState | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const disposer = events.onOpenFile((event: ExplorerOpenFileEvent): void => {
      const id = ++requestIdRef.current
      setFile({ path: event.path, name: event.name, rootPath: event.rootPath, phase: 'loading' })
      void (async () => {
        const res = await rpc.call(Endpoints.explorerRead, { path: event.path })
        // A newer open superseded this read: drop the stale response.
        if (requestIdRef.current !== id) return
        if (res.ok) {
          setFile({
            path: event.path,
            name: event.name,
            rootPath: event.rootPath,
            phase: 'loaded',
            content: res.value.content,
            truncated: res.value.truncated,
          })
        } else {
          setFile({
            path: event.path,
            name: event.name,
            rootPath: event.rootPath,
            phase: 'error',
            errorMessage: res.error.message,
          })
        }
      })()
    })
    return disposer
  }, [events, rpc])

  const close = useCallback((): void => {
    // Invalidate any in-flight read so its late response cannot reopen the modal.
    requestIdRef.current += 1
    setFile(null)
  }, [])

  // Escape closes the modal; the listener is armed only while one is open.
  useEffect(() => {
    if (file === null) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [file, close])

  if (file === null) return null

  return (
    // A separate close on the transparent backdrop allows click-outside while
    // leaving the dialog itself as an interactive modal region.
    <div className={styles.backdrop} onClick={close} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('editor.title')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.title} title={file.path}>{file.name}</span>
          <button
            type="button"
            className={styles.closeButton}
            aria-label={t('editor.close')}
            title={t('editor.close')}
            onClick={close}
          >
            <CloseIcon size={16} />
          </button>
        </div>
        <div className={styles.body}>
          {file.phase === 'loading' && (
            <div className={styles.status} role="status">{t('editor.loading')}</div>
          )}
          {file.phase === 'error' && (
            <div className={styles.error} role="alert">{file.errorMessage}</div>
          )}
          {file.phase === 'loaded' && (
            <>
              <pre className={styles.content}>{file.content}</pre>
              {file.truncated === true && <div className={styles.truncated}>{t('editor.truncated')}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
