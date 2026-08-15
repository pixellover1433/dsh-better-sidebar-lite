/**
 * Git log view tests (D8 §3.6): renders commit rows and the Load more control.
 * GitLogView is prop-only, so it is tested standalone — no dock, no rpc.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GitLogResult } from '../../../../src/contract/git.ts'
import { GitLogView } from '../../../../src/client/tabs/git/log-view.tsx'

const t: (key: string) => string = (key) => key

function logResult(overrides: Partial<GitLogResult> = {}): GitLogResult {
  return {
    entries: [
      {
        hash: 'c1111111111111111111111111111111111111111',
        shortHash: 'c111111',
        authorName: 'Ada',
        authorEmail: 'ada@example.test',
        authoredAtISO: '2024-03-01T10:00:00Z',
        subject: 'Add the sidebar',
      },
      {
        hash: 'c2222222222222222222222222222222222222222',
        shortHash: 'c222222',
        authorName: 'Bo',
        authorEmail: 'bo@example.test',
        authoredAtISO: '2024-02-15T08:30:00Z',
        subject: 'Wire the rpc channel',
      },
    ],
    truncated: false,
    ...overrides,
  }
}

afterEach(() => cleanup())

describe('GitLogView', () => {
  it('renders each commit: short hash, subject, author, and a time element', () => {
    render(<GitLogView result={logResult()} t={t} onLoadMore={() => {}} onSelectCommit={() => {}} />)
    expect(screen.getByText('Add the sidebar')).toBeTruthy()
    expect(screen.getByText('Wire the rpc channel')).toBeTruthy()
    expect(screen.getByText('c111111')).toBeTruthy()
    expect(screen.getByText('Ada')).toBeTruthy()
    expect(screen.getByText('Bo')).toBeTruthy()
    const time = screen.getByText('Ada').closest('div')?.querySelector('time')
    expect(time?.getAttribute('dateTime')).toBe('2024-03-01T10:00:00Z')
  })

  it('shows an empty state when there are no commits', () => {
    render(<GitLogView result={{ entries: [], truncated: false }} t={t} onLoadMore={() => {}} onSelectCommit={() => {}} />)
    expect(screen.getByText('emptyLog')).toBeTruthy()
  })

  it('renders a Load more button only when truncated and invokes onLoadMore', async () => {
    const onLoadMore = vi.fn()
    const { rerender } = render(<GitLogView result={logResult({ truncated: false })} t={t} onLoadMore={onLoadMore} onSelectCommit={() => {}} />)
    expect(screen.queryByRole('button', { name: 'loadMore' })).toBeNull()

    rerender(<GitLogView result={logResult({ truncated: true })} t={t} onLoadMore={onLoadMore} onSelectCommit={() => {}} />)
    const button = screen.getByRole('button', { name: 'loadMore' })
    const user = userEvent.setup()
    await user.click(button)
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('invokes onSelectCommit with the clicked commit', async () => {
    const onSelect = vi.fn()
    render(<GitLogView result={logResult()} t={t} onLoadMore={() => {}} onSelectCommit={onSelect} />)
    const user = userEvent.setup()
    await user.click(screen.getByText('Wire the rpc channel'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({ shortHash: 'c222222', subject: 'Wire the rpc channel' })
  })
})