/**
 * TreeNodeRow — one visible explorer tree row (D2 §9). Presentational: it
 * renders an entry at a depth and forwards user interactions via handlers; the
 * panel owns tree semantics (roving tabindex, keyboard, selection). The caret
 * toggles without moving selection; row click selects+focuses; double-click on
 * a file opens (see D2 §10).
 */
import type { Ref } from 'react'
import type { ExplorerEntry } from '../../../contract/explorer.ts'
import {
  ChevronDownIcon, ChevronRightIcon, FileIcon, FolderIcon, SymlinkIcon,
} from '../../icons.tsx'
import styles from './ExplorerPanel.module.css'

export interface TreeNodeRowProps {
  entry: ExplorerEntry
  depth: number
  expanded: boolean
  selected: boolean
  focused: boolean
  /** 'error' renders the inline retry affordance for a failed directory list. */
  loadState: 'idle' | 'loading' | 'error' | 'loaded'
  /** Localized label for the inline retry button. */
  retryLabel: string
  /** Localized caret labels (aria only). */
  expandLabel: string
  collapseLabel: string
  /** Failed-listing message rendered beside the retry affordance (S8). */
  errorMessage: string | undefined
  /** Toggle expansion without moving selection (caret click). */
  onToggle: () => void
  /** Select + focus this row (row click). */
  onActivate: () => void
  /** Open-file event (double-click on a file). */
  onOpen: () => void
  /** Retry a failed directory listing. */
  onRetry: () => void
  /** Forwarded to the row element for roving-tabindex focus management. */
  rowRef: Ref<HTMLDivElement>
}

function RowIcon({ entry }: { entry: ExplorerEntry }) {
  if (entry.kind === 'directory') return <FolderIcon size={15} />
  if (entry.kind === 'symlink') return <SymlinkIcon size={15} />
  return <FileIcon size={15} />
}

export function TreeNodeRow(props: TreeNodeRowProps) {
  const {
    entry, depth, expanded, selected, focused, loadState, retryLabel,
    expandLabel, collapseLabel, errorMessage,
    onToggle, onActivate, onOpen, onRetry, rowRef,
  } = props
  const dir = entry.kind === 'directory'
  const inlineError = dir && loadState === 'error'

  return (
    <div
      ref={rowRef}
      role="treeitem"
      tabIndex={focused ? 0 : -1}
      aria-selected={selected}
      aria-expanded={dir ? expanded : undefined}
      aria-label={entry.name}
      className={[
        styles.row,
        selected && styles.rowSelected,
        focused && styles.rowFocused,
      ].filter(Boolean).join(' ')}
      data-path={entry.path}
      style={{ paddingLeft: 8 + depth * 16 }}
      onClick={onActivate}
      onDoubleClick={() => { if (dir) onToggle(); else onOpen() }}
    >
      {dir ? (
        <button
          type="button"
          tabIndex={-1}
          data-caret={true}
          aria-label={expanded ? collapseLabel : expandLabel}
          className={styles.caret}
          onClick={(event) => { event.stopPropagation(); onToggle() }}
        >
          {expanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
        </button>
      ) : (
        <span className={[styles.caret, styles.caretPlaceholder].join(' ')} aria-hidden={true} />
      )}
      <span className={styles.icon} aria-hidden={true}><RowIcon entry={entry} /></span>
      <span className={styles.name}>{entry.name}</span>
      {entry.kind === 'symlink' && entry.linkTarget !== undefined && (
        <span className={styles.symlinkTarget} title={entry.linkTarget} aria-hidden={true}>
          {'→ '}{entry.linkTarget}
        </span>
      )}
      {inlineError && (
        <>
          {errorMessage !== undefined && <span className={styles.inlineError}>{errorMessage}</span>}
          <button
            type="button"
            className={styles.retry}
            onClick={(event) => { event.stopPropagation(); onRetry() }}
          >
            {retryLabel}
          </button>
        </>
      )}
    </div>
  )
}