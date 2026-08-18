/**
 * Git status view (ADR-004): four sections in fixed order — Staged, Conflicts,
 * Changes, Untracked — each with a count and optionally a section-level action.
 * Rows render a porcelain glyph, the path (last segment bold), and per-row
 * stage/unstage actions derived from the entry flags. Pure presentational plus
 * the stage/unstage RPC mutation; the parent owns fetch/refresh state.
 */
import type { GitStatusEntry, GitStatusResult } from '../../../contract/git.ts'
import type { BetterSidebarRpc } from '../../rpc-client.ts'
import { Endpoints } from '../../../contract/rpc.ts'
import type { ExplorerOpenFileEmitter } from '../explorer/events.ts'
import type { GitKey } from './locales.ts'
import styles from './git.module.css'

export interface GitStatusViewProps {
  /** Loaded status result (never null). */
  result: GitStatusResult
  /** Work-tree root sent as the `path` of stage/unstage requests. */
  root: string
  rpc: BetterSidebarRpc
  /** Open-file emitter; double-clicking a file row opens it via the shared modal. */
  emitter: ExplorerOpenFileEmitter
  /** Bound git-namespace translate. */
  t: (key: GitKey, params?: Record<string, unknown>) => string
  /** Invoked after a successful stage/unstage so the parent refetches status. */
  onChanged: () => void
  /** Invoked when a stage/unstage action fails (ADR-002 error surfaced). */
  onActionError: (message: string) => void
  /** Invoked to discard a file's working-tree changes (restore or clean). */
  onDiscard: (entry: GitStatusEntry) => void
  /** Invoked to discard all unstaged + untracked changes. */
  onDiscardAll: () => void
}

export type GlyphTone = 'added' | 'modified' | 'deleted' | 'renamed' | 'unmerged' | 'untracked'

// css-modules typing (noUncheckedIndexedAccess) yields string | undefined per class.
const TONE_CLASS: Record<GlyphTone, string | undefined> = {
  added: styles.added,
  modified: styles.modified,
  deleted: styles.deleted,
  renamed: styles.renamed,
  unmerged: styles.unmerged,
  untracked: styles.untracked,
}

/** Map a porcelain state letter to the visual tone. */
function toneOfLetter(letter: string): GlyphTone {
  switch (letter) {
    case 'A': return 'added'
    case 'D': return 'deleted'
    case 'R':
    case 'C': return 'renamed'
    case 'U': return 'unmerged'
    case '?': return 'untracked'
    default: return 'modified' // M, T, or unknown letters read as modified
  }
}

/**
 * The single glyph for a row. Untracked and conflicted entries state their kind
 * directly; others use the index letter (staged) or worktree letter (unstaged).
 */
function glyphOf(entry: GitStatusEntry): { letter: string; tone: GlyphTone } {
  if (entry.untracked) return { letter: '?', tone: 'untracked' }
  if (entry.conflicted) return { letter: 'U', tone: 'unmerged' }
  const raw = entry.staged ? entry.xy.charAt(0) : entry.xy.charAt(1)
  const letter = raw === '' || raw === ' ' ? 'M' : raw
  return { letter, tone: toneOfLetter(letter) }
}

/** Join a base class with an optional tone class, dropping undefined. */
function composeGlyph(base: string | undefined, tone: string | undefined): string {
  const prefix = base === undefined ? '' : base
  return tone === undefined ? prefix : prefix + ' ' + tone
}

/** Last path segment (bold) with the parent dirs dimmed. */
function PathDisplay({ path }: { path: string }) {
  const idx = path.lastIndexOf('/')
  if (idx === -1) return <span className={styles.fileName}>{path}</span>
  return (
    <span>
      <span className={styles.fileDir}>{path.slice(0, idx + 1)}</span>
      <span className={styles.fileName}>{path.slice(idx + 1)}</span>
    </span>
  )
}

interface RowActionsProps {
  entry: GitStatusEntry
  onStage: (entry: GitStatusEntry) => void
  onUnstage: (entry: GitStatusEntry) => void
  onDiscard: (entry: GitStatusEntry) => void
  t: GitStatusViewProps['t']
}

/** Per-row actions: Unstage when staged, Stage + Discard when unstaged/untracked. */
function RowActions({ entry, onStage, onUnstage, onDiscard, t }: RowActionsProps) {
  return (
    <span className={styles.rowActions}>
      {entry.staged && (
        <button type="button" className={styles.rowAction} aria-label={t('unstage') + ' ' + entry.path} onClick={() => onUnstage(entry)}>
          {t('unstage')}
        </button>
      )}
      {(entry.unstaged || entry.untracked) && (
        <button type="button" className={styles.rowAction} aria-label={t('stage') + ' ' + entry.path} onClick={() => onStage(entry)}>
          {t('stage')}
        </button>
      )}
      {(entry.unstaged || entry.untracked) && (
        <button
          type="button"
          className={styles.rowAction + ' ' + styles.discardAction}
          aria-label={t('discard') + ' ' + entry.path}
          onClick={() => onDiscard(entry)}
        >
          {t('discard')}
        </button>
      )}
    </span>
  )
}

interface RowProps extends RowActionsProps {
  entry: GitStatusEntry
  /** Open the row's file (double-click) via the shared emitter. */
  onOpen: (entry: GitStatusEntry) => void
}

function Row({ entry, onStage, onUnstage, onDiscard, onOpen, t }: RowProps) {
  const { letter, tone } = glyphOf(entry)
  const originalPath = entry.originalPath
  const fullLabel = originalPath === undefined ? entry.path : originalPath + ' -> ' + entry.path
  return (
    <div
      className={styles.row}
      aria-label={fullLabel}
      title={fullLabel}
      onDoubleClick={() => onOpen(entry)}
    >
      <span className={composeGlyph(styles.glyph, TONE_CLASS[tone])} aria-hidden="true">{letter}</span>
      <span className={styles.filePath}>
        {entry.originalPath !== undefined && (
          <span className={styles.originalPath}>{entry.originalPath} &rarr; </span>
        )}
        <PathDisplay path={entry.path} />
      </span>
      <RowActions entry={entry} onStage={onStage} onUnstage={onUnstage} onDiscard={onDiscard} t={t} />
    </div>
  )
}

interface SectionProps {
  title: string
  entries: readonly GitStatusEntry[]
  t: GitStatusViewProps['t']
  onStage: (entry: GitStatusEntry) => void
  onUnstage: (entry: GitStatusEntry) => void
  onDiscard: (entry: GitStatusEntry) => void
  /** Open a row's file (double-click). */
  onOpen: (entry: GitStatusEntry) => void
  /** Optional section-level action (e.g. Stage all / Unstage all). */
  sectionAction?: { label: string; onClick: () => void }
  conflictStyles?: boolean
}

function Section({ title, entries, t, onStage, onUnstage, onDiscard, onOpen, sectionAction, conflictStyles }: SectionProps) {
  const cls = conflictStyles ? styles.section + ' ' + styles.conflictSection : styles.section
  return (
    <section className={cls}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>
          {title}
          <span className={styles.sectionCount}>{entries.length}</span>
        </span>
        {sectionAction !== undefined && (
          <button type="button" className={styles.sectionAction} onClick={sectionAction.onClick}>
            {sectionAction.label}
          </button>
        )}
      </div>
      <div className={styles.rows}>
        {entries.map(entry => (
          <Row key={entry.path} entry={entry} onStage={onStage} onUnstage={onUnstage} onDiscard={onDiscard} onOpen={onOpen} t={t} />
        ))}
      </div>
    </section>
  )
}

export function GitStatusView({ result, root, rpc, emitter, t, onChanged, onActionError, onDiscard, onDiscardAll }: GitStatusViewProps) {
  async function stagePaths(files: readonly string[]): Promise<void> {
    const res = await rpc.call(Endpoints.gitStage, { path: root, files })
    if (res.ok) { onChanged(); return }
    onActionError(res.error.message)
  }

  async function unstagePaths(files: readonly string[]): Promise<void> {
    const res = await rpc.call(Endpoints.gitUnstage, { path: root, files })
    if (res.ok) { onChanged(); return }
    onActionError(res.error.message)
  }

  /** Open a row's working-tree file via the shared modal (double-click). */
  const openFile = (entry: GitStatusEntry): void => {
    // entry.path is `/`-separated repo-relative; join with the worktree root.
    const path = root + '/' + entry.path
    const name = entry.path.slice(entry.path.lastIndexOf('/') + 1)
    // Untracked files have no tracked base to diff (working tree vs index is a
    // no-op for them), so they open with no `diff` and the editor shows the full
    // new-file content via explorer/read — a "fully added" representation.
    if (!entry.untracked) {
      const base = entry.staged ? 'head' : 'index'
      emitter.emit({
        path, name, kind: 'file', source: 'double-click', rootPath: root,
        diff: { kind: 'status', base, root, file: entry.path },
      })
      return
    }
    emitter.emit({ path, name, kind: 'file', source: 'double-click', rootPath: root })
  }

  const onStage = (entry: GitStatusEntry) => { void stagePaths([entry.path]) }
  const onUnstage = (entry: GitStatusEntry) => { void unstagePaths([entry.path]) }

  const hasChanges = result.staged.length > 0 || result.conflicted.length > 0
    || result.unstaged.length > 0 || result.untracked.length > 0

  if (!hasChanges) {
    return <div className={styles.empty}>{t('emptyStatus')}</div>
  }

  const discardable = result.unstaged.length > 0 || result.untracked.length > 0
  return (
    <>
      {discardable && (
        <div className={styles.discardAllRow}>
          <button type="button" className={styles.discardAllButton} onClick={onDiscardAll}>
            {t('discardAll')}
          </button>
        </div>
      )}
      <div className={styles.statusSections}>
      {result.staged.length > 0 && (
        <Section
          title={t('staged')}
          entries={result.staged}
          t={t}
          onStage={onStage}
          onUnstage={onUnstage}
          onDiscard={onDiscard}
          onOpen={openFile}
          sectionAction={{
            label: t('unstageAll'),
            onClick: () => { void unstagePaths(result.staged.map(e => e.path)) },
          }}
        />
      )}
      {result.conflicted.length > 0 && (
        <Section
          title={t('conflicts')}
          entries={result.conflicted}
          t={t}
          onStage={onStage}
          onUnstage={onUnstage}
          onDiscard={onDiscard}
          onOpen={openFile}
          conflictStyles
        />
      )}
      {result.unstaged.length > 0 && (
        <Section
          title={t('changes')}
          entries={result.unstaged}
          t={t}
          onStage={onStage}
          onUnstage={onUnstage}
          onDiscard={onDiscard}
          onOpen={openFile}
          sectionAction={{
            label: t('stageAll'),
            onClick: () => { void stagePaths(result.unstaged.map(e => e.path)) },
          }}
        />
      )}
      {result.untracked.length > 0 && (
        <Section
          title={t('untracked')}
          entries={result.untracked}
          t={t}
          onStage={onStage}
          onUnstage={onUnstage}
          onDiscard={onDiscard}
          onOpen={openFile}
          sectionAction={{
            label: t('stageAll'),
            onClick: () => { void stagePaths(result.untracked.map(e => e.path)) },
          }}
        />
      )}
      </div>
    </>
  )
}