/**
 * Presentational tab bar (ADR-003, D7 §7.2): a role=tablist of buttons with
 * icon + label, roving tabindex, and arrow-key (Left/Right + Home/End)
 * activation. Pure — the dock feeds it a resolved snapshot.
 */
import { useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import css from './tablist.module.css'

export interface TabListTab {
  id: string
  /** Already-resolved label. */
  label: string
  icon: ReactNode
}

export interface TabListProps {
  /** Ordered tabs snapshot. */
  tabs: readonly TabListTab[]
  activeId: string | undefined
  onSelect(id: string): void
  /** aria-label for the list. */
  label: string
}

/** Stable ids shared by the tab buttons and the tab panel. */
export const tabPanelId = (id: string): string => `bsd-panel-${id}`
export const tabButtonId = (id: string): string => `bsd-tab-${id}`

export function TabList({ tabs, activeId, onSelect, label }: TabListProps): ReactNode {
  const buttons = useRef(new Map<string, HTMLButtonElement>())

  const focusTab = (index: number): void => {
    const next = tabs[(index + tabs.length) % tabs.length]
    if (next === undefined) return
    buttons.current.get(next.id)?.focus()
    onSelect(next.id)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const index = tabs.findIndex(t => t.id === activeId)
    if (index === -1) return
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        focusTab(index + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        focusTab(index - 1)
        break
      case 'Home':
        e.preventDefault()
        focusTab(0)
        break
      case 'End':
        e.preventDefault()
        focusTab(tabs.length - 1)
        break
      default:
        break
    }
  }

  return (
    <div role="tablist" aria-label={label} className={css.list} onKeyDown={onKeyDown}>
      {tabs.map(t => {
        const selected = t.id === activeId
        return (
          <button
            key={t.id}
            ref={node => {
              if (node) buttons.current.set(t.id, node)
              else buttons.current.delete(t.id)
            }}
            role="tab"
            id={tabButtonId(t.id)}
            aria-selected={selected}
            aria-controls={tabPanelId(t.id)}
            tabIndex={selected ? 0 : -1}
            className={selected ? css.tabActive : css.tabInactive}
            onClick={() => onSelect(t.id)}
          >
            {t.icon}
            <span className={css.label}>{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
