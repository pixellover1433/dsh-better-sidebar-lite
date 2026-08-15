/**
 * Git commit log view (ADR-004): a newest-first list of GitLogEntry rows plus a
 * "Load more" control when the page is truncated. No merge badge in v1 — the
 * contract's GitLogEntry carries no parents field, so merge commits are not
 * distinguishable; add that field and a badge when log detail becomes a goal.
 */
import type { GitLogEntry, GitLogResult } from '../../../contract/git.ts'
import type { GitKey } from './locales.ts'
import styles from './git.module.css'

export interface GitLogViewProps {
  /** Loaded log result (never null). */
  result: GitLogResult
  /** Bound git-namespace translate. */
  t: (key: GitKey, params?: Record<string, unknown>) => string
  /** Invoked when the user requests the next page (parent refetches with a larger limit). */
  onLoadMore: () => void
  /** Invoked when the user clicks a commit row (opens its changed-files view). */
  onSelectCommit: (entry: GitLogEntry) => void
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

export function GitLogView({ result, t, onLoadMore, onSelectCommit }: GitLogViewProps) {
  const hasCommits = result.entries.length > 0

  return (
    <div>
      <div className={styles.commits}>
        {hasCommits ? (
          result.entries.map(entry => {
            const date = dateFormatter.format(new Date(entry.authoredAtISO))
            return (
              <button
                type="button"
                className={styles.commitRow}
                key={entry.hash}
                onClick={() => onSelectCommit(entry)}
                aria-label={t('commitDetailTitle') + ': ' + entry.subject}
                title={t('commitDetailTitle')}
              >
                <div className={styles.commitSubject}>{entry.subject}</div>
                <div className={styles.commitMeta}>
                  <span className={styles.commitHash}>{entry.shortHash}</span>
                  <span className={styles.commitAuthor}>{entry.authorName}</span>
                  <time className={styles.commitDate} dateTime={entry.authoredAtISO}>{date}</time>
                </div>
              </button>
            )
          })
        ) : (
          <div className={styles.empty}>{t('emptyLog')}</div>
        )}
      </div>
      {result.truncated && (
        <button type="button" className={styles.loadMore} onClick={onLoadMore}>
          {t('loadMore')}
        </button>
      )}
    </div>
  )
}