/**
 * Commit detail view: the full commit message plus the files it touched
 * (git/commit-detail). Replaces the log list while open; the parent owns the
 * fetch state.
 */
import type { GitCommitFile, GitCommitDetailResult, GitLogEntry } from '../../../contract/git.ts'
import type { GitKey } from './locales.ts'
import styles from './git.module.css'

export interface CommitDetailViewProps {
  commit: GitLogEntry
  /** Fetch state: 'loading' | error message | loaded result. */
  state: { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'loaded'; result: GitCommitDetailResult }
  t: (key: GitKey, params?: Record<string, unknown>) => string
  onBack: () => void
  onRetry: () => void
  /** Open a changed file's diff (double-click) via the shared open-file emitter. */
  onOpenFile: (file: GitCommitFile) => void
}

type Tone = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'other'

/** Status letter -> visual tone (reuses the status-view palette classes). */
function toneOf(status: GitCommitFile['status']): Tone {
  switch (status) {
    case 'A': return 'added'
    case 'M':
    case 'T': return 'modified'
    case 'D': return 'deleted'
    case 'R': return 'renamed'
    case 'C': return 'copied'
    default: return 'other'
  }
}

const TONE_CLASS: Record<Tone, string | undefined> = {
  added: styles.added,
  modified: styles.modified,
  deleted: styles.deleted,
  renamed: styles.renamed,
  copied: styles.modified,
  other: styles.muted,
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

export function CommitDetailView({ commit, state, t, onBack, onRetry, onOpenFile }: CommitDetailViewProps) {
  return (
    <div className={styles.commitDetail}>
      <div className={styles.commitDetailHead}>
        <button type="button" className={styles.backButton} onClick={onBack}>
          {'\u2190 '}{t('back')}
        </button>
        <div className={styles.commitDetailTitle}>{commit.subject}</div>
        <div className={styles.commitMeta}>
          <span className={styles.commitHash}>{commit.shortHash}</span>
          <span className={styles.commitAuthor}>{commit.authorName}</span>
          <time className={styles.commitDate} dateTime={commit.authoredAtISO}>
            {dateFormatter.format(new Date(commit.authoredAtISO))}
          </time>
        </div>
      </div>

      {state.kind === 'loading' && <div className={styles.loading}>{t('loading')}</div>}
      {state.kind === 'error' && (
        <div className={styles.state}>
          <div className={styles.stateHint}>{state.message}</div>
          <button type="button" className={styles.stateAction} onClick={onRetry}>{t('errorRetry')}</button>
        </div>
      )}
      {state.kind === 'loaded' && (
        <>
          {state.result.message.length > 0 && (
            <pre className={styles.commitMessage}>{state.result.message}</pre>
          )}
          {state.result.files.length === 0
            ? <div className={styles.empty}>{t('emptyCommitFiles')}</div>
            : (
              <div className={styles.commitFiles}>
                {state.result.files.map(file => {
                  const cls = TONE_CLASS[toneOf(file.status)]
                  return (
                    <div
                      className={styles.commitFileRow}
                      key={file.path}
                      onDoubleClick={() => onOpenFile(file)}
                      title={file.path}
                    >
                      <span className={[styles.fileStatus, cls].filter(Boolean).join(' ')}>{file.status}</span>
                      <span className={styles.filePath}>
                        {file.originalPath !== undefined && (
                          <span className={styles.originalPath}>{file.originalPath} {'\u2192'} </span>
                        )}
                        <span className={styles.commitFilePath}>{file.path}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
        </>
      )}
    </div>
  )
}
