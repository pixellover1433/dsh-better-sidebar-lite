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
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { Endpoints } from '../../contract/rpc.ts'
import type { BetterSidebarRpc } from '../rpc-client.ts'
import type { ExplorerEvents, ExplorerOpenFileEvent } from '../tabs/explorer/events.ts'
import { CloseIcon } from '../icons.tsx'
import { parseUnifiedDiff, type DiffHunk } from './diff-parse.ts'
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
  /**
   * 'content' renders raw file text (explorer opens); 'diff' renders a unified
   * git patch (git opens).
   */
  mode: 'content' | 'diff'
  /** Present when phase === 'loaded'. */
  content?: string
  /** Present when phase === 'loaded'; true when the host cut the content at its cap. */
  truncated?: boolean
  /** Present when phase === 'error'. */
  errorMessage?: string
}

/**
 * Persisted, user-resized modal width/height in px; `null` means the CSS
 * default (auto / max-*). Stored under a stable localStorage key so the chosen
 * size survives reloads. Best effort: quota/denied keeps it in-memory only.
 */
interface ModalSize {
  width: number | null
  height: number | null
}

/** Default user-resizable size: unset so CSS max-width/max-height apply. */
const DEFAULT_MODAL_SIZE: ModalSize = { width: null, height: null }

/** localStorage key holding the last user-resized modal size. */
const MODAL_SIZE_KEY = 'dsh.betterSidebar.fileModalSize'

/** Backdrop padding (px) used to clamp the resized modal inside the viewport. */
const MODAL_PADDING = 16

/** Read a persisted modal size; anything malformed/absent falls back to default. */
function readSavedModalSize(): ModalSize {
  if (typeof localStorage === 'undefined') return DEFAULT_MODAL_SIZE
  try {
    const raw = localStorage.getItem(MODAL_SIZE_KEY)
    if (raw === null) return DEFAULT_MODAL_SIZE
    const parsed = JSON.parse(raw) as { width?: unknown; height?: unknown }
    const width = typeof parsed.width === 'number' && Number.isFinite(parsed.width) ? parsed.width : null
    const height = typeof parsed.height === 'number' && Number.isFinite(parsed.height) ? parsed.height : null
    return { width, height }
  } catch {
    return DEFAULT_MODAL_SIZE
  }
}

/** Persist a modal size (best effort; quota/denied keeps in-memory only). */
function persistModalSize(size: ModalSize): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(MODAL_SIZE_KEY, JSON.stringify(size))
  } catch {
    // quota/denied: keep in-memory only
  }
}

/**
 * Clamp a candidate px size into the viewport (accounting for the backdrop
 * padding so a dragged edge can never push the modal off-screen).
 */
function clampToViewport(value: number, isHeight: boolean): number {
  const limit = (isHeight ? window.innerHeight : window.innerWidth) - MODAL_PADDING * 2
  return Math.max(160, Math.min(value, limit))
}

/** Dialog inline style: the dialog's own CSS props plus the resize custom properties. */
interface ModalDialogStyle extends CSSProperties {
  '--bsd-modal-w'?: string
  '--bsd-modal-h'?: string
}

/**
 * Renders the loaded diff payload as a two-pane (old/new) side-by-side view.
 *
 * The unified patch is parsed into hunk-aligned rows; each row paints both the
 * left (old) and right (new) cells so context, additions, and deletions line
 * up like a real diff view. Degrades gracefully: a `null` parse (malformed
 * patch) and an empty diff both fall back to safe, non-crashing renderings.
 */
function DiffView({ diff, t }: { diff: string; t: FileModalEditorProps['t'] }): JSX.Element {
  if (diff === '') {
    // No patch at all (host set `empty`): nothing to compare.
    return <div className={styles.status}>{t('editor.noChanges')}</div>
  }
  const hunks = parseUnifiedDiff(diff)
  if (hunks === null) {
    // Unparseable patch — never crash; show the raw text in a single pane.
    return <pre className={styles.content}>{diff}</pre>
  }
  return (
    <div className={styles.diff}>
      {hunks.map((hunk, hunkIndex) => (
        <DiffHunkView key={hunkIndex} hunk={hunk} />
      ))}
    </div>
  )
}

/** One `@@` hunk: a separator header followed by the aligned two-pane rows. */
function DiffHunkView({ hunk }: { hunk: DiffHunk }): JSX.Element {
  return (
    <section className={styles.diffHunk}>
      <div className={styles.diffHunkHeader}>
        @@ -{hunk.oldStart} +{hunk.newStart} @@
      </div>
      <div className={styles.diffRows}>
        {hunk.rows.map((row, rowIndex) => {
          // Left shows context + deletions; right shows context + additions.
          const left = row.type === 'add' ? '' : row.text
          const right = row.type === 'delete' ? '' : row.text
          // css-modules typing (noUncheckedIndexedAccess) yields string | undefined.
          const leftClass = row.type === 'delete' ? styles.cellDelete : ''
          const rightClass = row.type === 'add' ? styles.cellAdd : ''
          return (
            <div className={styles.diffRow} key={rowIndex}>
              <div className={styles.diffCell + ' ' + leftClass}>
                <span className={styles.diffLineNum}>{row.oldLine ?? ''}</span>
                <span className={styles.diffLineText}>{left}</span>
              </div>
              <div className={styles.diffCell + ' ' + rightClass}>
                <span className={styles.diffLineNum}>{row.newLine ?? ''}</span>
                <span className={styles.diffLineText}>{right}</span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/**
 * The sidebar-wide file modal. Subscribes to open-file events once per mount
 * and supersedes an in-flight read when a newer open arrives, so rapid
 * double-clicks always settle on the last-opened file.
 */
export function FileModalEditor({ rpc, events, t }: FileModalEditorProps): JSX.Element | null {
  const [file, setFile] = useState<OpenFileState | null>(null)
  const requestIdRef = useRef(0)

  // User-resized modal size, restored from localStorage on mount. `null` means
  // the CSS default; a set value is applied as an inline width/height on the
  // dialog. Only used while a modal is open, but kept as component state so it
  // survives opens within one mount.
  const [size, setSize] = useState<ModalSize>(() => readSavedModalSize())

  // Right-edge and corner drag resize. A handle captures pointerdown, then a
  // window-level pointermove updates width/height (clamped to the viewport)
  // and pointerup stops the drag and persists. Pointer events are used (not just
  // mouse) for robustness, and the capture set prevents the drag selecting text.
  const dragRef = useRef<{
    axis: 'width' | 'both'
    startX: number
    startY: number
    startWidth: number
    startHeight: number
  } | null>(null)

  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      const drag = dragRef.current
      if (drag === null) return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      e.preventDefault()
      setSize(prev => {
        const next: ModalSize = {
          width: drag.axis === 'width' || drag.axis === 'both'
            ? clampToViewport(drag.startWidth + dx, false)
            : prev.width,
          height: drag.axis === 'both'
            ? clampToViewport(drag.startHeight + dy, true)
            : prev.height,
        }
        // Live-persist while dragging so an interrupted release still saves.
        persistModalSize(next)
        return next
      })
    }
    const onUp = (e: PointerEvent): void => {
      if (dragRef.current === null) return
      dragRef.current = null
      e.preventDefault()
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [])

  /** Start a resize drag from the given handle axis and the current modal box. */
  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>, axis: 'width' | 'both'): void => {
    e.preventDefault()
    e.stopPropagation()
    const dialog = e.currentTarget.parentElement as HTMLElement
    const rect = dialog.getBoundingClientRect()
    dragRef.current = {
      axis,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: Math.round(rect.width),
      startHeight: Math.round(rect.height),
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = axis === 'both' ? 'nwse-resize' : 'ew-resize'
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  useEffect(() => {
    const disposer = events.onOpenFile((event: ExplorerOpenFileEvent): void => {
      const id = ++requestIdRef.current
      const diff = event.diff
      const mode = diff === undefined ? 'content' : 'diff'
      setFile({ path: event.path, name: event.name, rootPath: event.rootPath, mode, phase: 'loading' })
      void (async () => {
        // Untracked/missing rows and explorer opens carry no `diff`, so read the
        // raw file; tracked status opens (kind 'status') fetch the file's
        // working-tree diff; old-commit opens (kind 'commit') fetch the file's
        // diff as introduced by that commit.
        const res = diff === undefined
          ? await rpc.call(Endpoints.explorerRead, { path: event.path })
          : diff.kind === 'status'
            ? await rpc.call(Endpoints.gitDiff, { path: diff.root, file: diff.file, base: diff.base })
            : await rpc.call(Endpoints.gitCommitFileDiff, { path: diff.root, hash: diff.hash, file: diff.file })
        // A newer open superseded this read: drop the stale response.
        if (requestIdRef.current !== id) return
        if (res.ok) {
          // Explorer reads carry `truncated`; git diffs carry `diff` and never
          // truncate (git output for one file is already bounded).
          const { content, truncated } = 'truncated' in res.value
            ? { content: res.value.content, truncated: res.value.truncated }
            : { content: res.value.diff, truncated: false }
          setFile({
            path: event.path,
            name: event.name,
            rootPath: event.rootPath,
            mode,
            phase: 'loaded',
            content,
            truncated,
          })
        } else {
          setFile({
            path: event.path,
            name: event.name,
            rootPath: event.rootPath,
            mode,
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

  // Apply a user-resized width/height as CSS custom properties so they override
  // the dialog's CSS default without a max-width/max-height cascade conflict.
  // The values were clamped to the viewport during the drag.
  const modalStyle: ModalDialogStyle = {}
  if (size.width !== null) modalStyle['--bsd-modal-w'] = size.width + 'px'
  if (size.height !== null) modalStyle['--bsd-modal-h'] = size.height + 'px'

  return (
    // A separate close on the transparent backdrop allows click-outside while
    // leaving the dialog itself as an interactive modal region.
    <div className={styles.backdrop} onClick={close} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('editor.title')}
        style={modalStyle}
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
              {file.mode === 'diff' ? (
                <DiffView diff={file.content ?? ''} t={t} />
              ) : (
                <pre className={styles.content}>{file.content}</pre>
              )}
              {file.truncated === true && <div className={styles.truncated}>{t('editor.truncated')}</div>}
            </>
          )}
        </div>
        {/* Right-edge handle resizes width; the corner handle resizes both. */}
        <div
          className={styles.resizeHandle}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('editor.resize')}
          onPointerDown={(e) => onResizeStart(e, 'width')}
        />
        <div
          className={styles.resizeCorner}
          role="separator"
          aria-label={t('editor.resizeCorner')}
          onPointerDown={(e) => onResizeStart(e, 'both')}
        />
      </div>
    </div>
  )
}
