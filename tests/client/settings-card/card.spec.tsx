/**
 * Card component render tests (ADR-004 §3 amendment). Verifies the card mirrors
 * the shipped plugin-card design system: the PluginCard chrome (header
 * disclosure + chevron, unsaved pill, save/discard/failed footer, readOnly
 * notice), the ValueField control (label + overridden badge + reset),
 * locale-aware copy, and that it renders nothing while its namespace is
 * unavailable.
 */
import { describe, expect, it, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { BetterSidebarSettingsCard, type BetterSidebarSettingsCardProps } from '../../../src/client/settings-card/BetterSidebarSettingsCard.tsx'
import type { SidebarCardActions, SidebarCardState } from '../../../src/client/settings-card/controller.ts'
import { SETTING_RANGES } from '../../../src/contract/settings.ts'
import { en } from '../../../src/client/settings-card/locales.ts'

afterEach(() => { cleanup() })

/** Build a fake card state + actions without the controller/renderer machinery. */
function renderCard(state: SidebarCardState) {
  const actions: SidebarCardActions = {
    edit: () => {}, resetField: () => {}, save: () => {}, discard: () => {},
  }
  const props = {
    ...actions,
    useSettingsCard: (sel: (s: SidebarCardState) => unknown) => sel(state),
    t: (key: keyof typeof en) => en[key],
  } as BetterSidebarSettingsCardProps
  const { container } = render(<BetterSidebarSettingsCard {...props} />)
  return container
}

function baseState(overrides: Partial<SidebarCardState> = {}): SidebarCardState {
  return {
    available: true,
    writable: true,
    dirty: false,
    invalid: false,
    saving: false,
    failed: false,
    fields: {
      explorerPollMs: { text: '8000', overridden: true, invalid: false },
      explorerDebounceMs: { text: '600', overridden: false, invalid: false },
      gitPollMs: { text: '8000', overridden: false, invalid: false },
      gitDebounceMs: { text: '600', overridden: false, invalid: false },
    },
    ...overrides,
  }
}

describe('BetterSidebarSettingsCard', () => {
  it('renders the plugin name, description, and a disclosure header', () => {
    renderCard(baseState())
    const button = screen.getByRole('button', { name: `Show settings: ${en.cardTitle}` })
    expect(button).toBeTruthy()
    expect(screen.getByText(en.cardTitle)).toBeTruthy()
    expect(screen.getByText(en.cardDescription)).toBeTruthy()
  })

  it('renders nothing while the namespace is unavailable', () => {
    const container = renderCard(baseState({ available: false }))
    expect(container.firstChild).toBeNull()
  })

  it('shows an unsaved pill while the card holds dirty edits', () => {
    renderCard(baseState({ dirty: true }))
    expect(screen.getByText(en.unsaved)).toBeTruthy()
  })

  it('reveals labelled controls with an overridden badge and reset on expand', () => {
    renderCard(baseState())
    fireEvent.click(screen.getByRole('button', { name: `Show settings: ${en.cardTitle}` }))
    expect(screen.getByLabelText(en.explorerPollMs)).toBeTruthy()
    expect(screen.getByLabelText(en.gitPollMs)).toBeTruthy()
    // The overridden field shows its badge + reset; the non-overridden one does not.
    expect(screen.getByText(en.overridden)).toBeTruthy()
    expect(screen.getByText(en.reset)).toBeTruthy()
  })

  it('renders the save and discard buttons and shows a failed notice on failure', () => {
    renderCard(baseState({ failed: true, dirty: true }))
    fireEvent.click(screen.getByRole('button', { name: `Show settings: ${en.cardTitle}` }))
    expect(screen.getByRole('button', { name: en.discard })).toBeTruthy()
    expect(screen.getByRole('button', { name: en.save })).toBeTruthy()
    expect(screen.getByText(en.saveFailed)).toBeTruthy()
  })

  it('shows the readOnly status when the document is not writable', () => {
    renderCard(baseState({ writable: false }))
    fireEvent.click(screen.getByRole('button', { name: `Show settings: ${en.cardTitle}` }))
    expect(screen.getByText(en.readOnly)).toBeTruthy()
  })

  it('states the allowed range on a field whose draft is invalid', () => {
    const { min, max } = SETTING_RANGES.explorerPollMs
    renderCard(baseState({
      dirty: true,
      invalid: true,
      fields: {
        ...baseState().fields,
        explorerPollMs: { text: String(min - 1), overridden: true, invalid: true },
      },
    }))
    fireEvent.click(screen.getByRole('button', { name: `Show settings: ${en.cardTitle}` }))
    const expected = en.invalidRange.replace('{min}', String(min)).replace('{max}', String(max))
    expect(screen.getByText(expected)).toBeTruthy()
  })
})
